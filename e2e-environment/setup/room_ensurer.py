"""
Utility that initializes public rooms and ensures correct federation

In Raiden we use a public discovery room that all nodes join which provides the following features:
- Nodes are findable in the server-side user search
- All nodes receive presence updates about existing and newly joined nodes

The global room is initially created on one server, after that it is federated to all other servers
and a server-local alias is added to it so it's discoverable on every server.

This utility uses for following algorithm to ensure there are no races in room creation:
- Sort list of known servers lexicographically
- Connect to all known servers
- If not all servers are reachable, sleep and retry later
- Try to join room `#<public_room_alias>:<connected_server>`
- Compare room_id of all found rooms
- If either the room_ids differ or no room is found on a specific server:
  - If `own_server` is the first server in the list:
    - Create a room if it doesn't exist and assign the server-local alias
  - Else:
    - If a room with alias `#<public_room_alias>:<own_server>` exists, remove that alias
    - Wait for the room with `#<public_room_alias>:<first_server>` to appear
    - Add server-local alias to the first_server-room
"""
from gevent.monkey import patch_all  # isort:skip

patch_all()  # isort:skip

import json
import os
import sys
from dataclasses import dataclass
from enum import IntEnum, Enum
from itertools import chain
from json import JSONDecodeError
from typing import Any, Dict, Optional, Set, TextIO, Tuple, Union
from urllib.parse import urlparse

import click
import gevent
from eth_utils import encode_hex, to_normalized_address
from matrix_client.errors import MatrixError
from raiden_contracts.utils.type_aliases import ChainID
from structlog import get_logger

from raiden.constants import (
    DISCOVERY_DEFAULT_ROOM,
    MONITORING_BROADCASTING_ROOM,
    PATH_FINDING_BROADCASTING_ROOM,
    Environment,
)
from raiden.log_config import configure_logging
from raiden.network.transport.matrix import make_room_alias
from raiden.network.transport.matrix.client import GMatrixHttpApi
from raiden.settings import DEFAULT_MATRIX_KNOWN_SERVERS
from raiden.tests.utils.factories import make_signer

ENV_KEY_KNOWN_SERVERS = "URL_KNOWN_FEDERATION_SERVERS"


class Networks(Enum):
    INTEGRATION = ChainID(4321)


class MatrixPowerLevels(IntEnum):
    USER = 0
    MODERATOR = 50
    ADMINISTRATOR = 100


log = get_logger(__name__)


class EnsurerError(Exception):
    pass


class MultipleErrors(EnsurerError):
    pass


@dataclass(frozen=True)
class RoomInfo:
    room_id: str
    aliases: Set[str]
    server_name: str


class RoomEnsurer:
    def __init__(
        self,
        username: str,
        password: str,
        own_server_name: str,
        known_servers_url: Optional[str] = None,
    ):
        self._username = username
        self._password = password
        self._own_server_name = own_server_name

        if known_servers_url is None:
            known_servers_url = DEFAULT_MATRIX_KNOWN_SERVERS[Environment.PRODUCTION]

        self._known_servers: Dict[str, str] = {
            own_server_name: f"http://{own_server_name}:80"
        }


        if not self._known_servers:
            raise RuntimeError(f"No known servers found from list at {known_servers_url}.")
        self._first_server_name = list(self._known_servers.keys())[0]
        self._is_first_server = own_server_name == self._first_server_name
        self._apis: Dict[str, GMatrixHttpApi] = self._connect_all()
        self._own_api = self._apis[own_server_name]

        log.debug(
            "Room ensurer initialized",
            own_server_name=own_server_name,
            known_servers=self._known_servers.keys(),
            first_server_name=self._first_server_name,
            is_first_server=self._is_first_server,
        )

    def ensure_rooms(self) -> None:
        exceptions = {}
        for network in Networks:
            for alias_fragment in [
                DISCOVERY_DEFAULT_ROOM,
                MONITORING_BROADCASTING_ROOM,
                PATH_FINDING_BROADCASTING_ROOM,
            ]:
                try:
                    self._ensure_room_for_network(network, alias_fragment)
                except (MatrixError, EnsurerError) as ex:
                    log.exception(f"Error while ensuring room for {network.name}.")
                    exceptions[network] = ex
        if exceptions:
            log.error("Exceptions happened", exceptions=exceptions)
            raise MultipleErrors(exceptions)

    def _ensure_room_for_network(self, network: Networks, alias_fragment: str) -> None:
        log.info(f"Ensuring {alias_fragment} room for {network.name}")
        room_alias_prefix = make_room_alias(ChainID(network.value), alias_fragment)
        room_infos: Dict[str, Optional[RoomInfo]] = {
            server_name: self._get_room(server_name, room_alias_prefix)
            for server_name in self._known_servers.keys()
        }
        first_server_room_info = room_infos[self._first_server_name]

        if not first_server_room_info:
            log.warning("First server room missing")
            if self._is_first_server:
                log.info("Creating room", server_name=self._own_server_name)
                first_server_room_info = self._create_room(
                    self._own_server_name, room_alias_prefix
                )
                room_infos[self._first_server_name] = first_server_room_info
            else:
                raise EnsurerError("First server room missing.")

        are_all_rooms_the_same = all(
            room_info is not None and room_info.room_id == first_server_room_info.room_id
            for room_info in room_infos.values()
        )
        if not are_all_rooms_the_same:
            log.warning(
                "Room id mismatch",
                alias_prefix=room_alias_prefix,
                expected=first_server_room_info.room_id,
                found={
                    server_name: room_info.room_id if room_info else None
                    for server_name, room_info in room_infos.items()
                },
            )
            own_server_room_info = room_infos.get(self._own_server_name)
            own_server_room_alias = f"#{room_alias_prefix}:{self._own_server_name}"
            first_server_room_alias = f"#{room_alias_prefix}:{self._first_server_name}"
            if not own_server_room_info:
                log.warning(
                    "Room missing on own server, adding alias",
                    server_name=self._own_server_name,
                    room_id=first_server_room_info.room_id,
                    new_room_alias=own_server_room_alias,
                )
                self._join_and_alias_room(first_server_room_alias, own_server_room_alias)
                log.info("Room alias set", alias=own_server_room_alias)
            elif own_server_room_info.room_id != first_server_room_info.room_id:
                log.warning(
                    "Conflicting local room, reassigning alias",
                    server_name=self._own_server_name,
                    expected_room_id=first_server_room_info.room_id,
                    current_room_id=own_server_room_info.room_id,
                )
                self._own_api.remove_room_alias(own_server_room_alias)
                self._join_and_alias_room(first_server_room_alias, own_server_room_alias)
                log.info(
                    "Room alias updated",
                    alias=own_server_room_alias,
                    room_id=first_server_room_info.room_id,
                )
            else:
                log.warning("Mismatching rooms on other servers. Doing nothing.")
        else:
            log.info(
                "Room state ok.",
                network=network,
                server_rooms={
                    server_name: room_info.room_id if room_info else None
                    for server_name, room_info in room_infos.items()
                },
            )

    def _join_and_alias_room(
        self, first_server_room_alias: str, own_server_room_alias: str
    ) -> None:
        response = self._own_api.join_room(first_server_room_alias)
        own_room_id = response.get("room_id")
        if not own_room_id:
            raise EnsurerError("Couldn't join first server room via federation.")
        log.debug("Joined room on first server", own_room_id=own_room_id)
        self._own_api.set_room_alias(own_room_id, own_server_room_alias)

    def _get_room(self, server_name: str, room_alias_prefix: str) -> Optional[RoomInfo]:
        api = self._apis[server_name]
        room_alias_local = f"#{room_alias_prefix}:{server_name}"
        try:
            response = api.join_room(room_alias_local)
            room_id = response.get("room_id")
            if not room_id:
                log.debug("Couldn't find room", room_alias=room_alias_local)
                return None
            room_state = api.get_room_state(response["room_id"])
        except MatrixError:
            log.debug("Room doesn't exist", room_alias=room_alias_local)
            return None
        existing_room_aliases = set(
            chain.from_iterable(
                event["content"]["aliases"]
                for event in room_state
                if event["type"] == "m.room.aliases"
            )
        )

        log.debug(
            "Room aliases", server_name=server_name, room_id=room_id, aliases=existing_room_aliases
        )
        return RoomInfo(room_id=room_id, aliases=existing_room_aliases, server_name=server_name)

    def _create_server_user_power_levels(self) -> Dict[str, Any]:

        server_admin_power_levels: Dict[str, Union[int, Dict[str, int]]] = {
            "users": {},
            "users_default": MatrixPowerLevels.USER,
            "events": {
                "m.room.power_levels": MatrixPowerLevels.ADMINISTRATOR,
                "m.room.history_visibility": MatrixPowerLevels.ADMINISTRATOR,
            },
            "events_default": MatrixPowerLevels.USER,
            "state_default": MatrixPowerLevels.MODERATOR,
            "ban": MatrixPowerLevels.MODERATOR,
            "kick": MatrixPowerLevels.MODERATOR,
            "redact": MatrixPowerLevels.MODERATOR,
            "invite": MatrixPowerLevels.MODERATOR,
        }

        for server_name in self._known_servers:
            username = f"admin-{server_name}".replace(":", "-")
            user_id = f"@{username}:{server_name}"
            server_admin_power_levels["users"][user_id] = MatrixPowerLevels.MODERATOR

        own_user_id = f"@{self._username}:{self._own_server_name}"
        server_admin_power_levels["users"][own_user_id] = MatrixPowerLevels.ADMINISTRATOR

        return server_admin_power_levels

    def _create_room(self, server_name: str, room_alias_prefix: str) -> RoomInfo:
        api = self._apis[server_name]
        server_admin_power_levels = self._create_server_user_power_levels()
        response = api.create_room(
            room_alias_prefix,
            is_public=True,
            # power_level_content_override=server_admin_power_levels,
        )
        room_alias = f"#{room_alias_prefix}:{server_name}"
        return RoomInfo(response["room_id"], {room_alias}, server_name)

    def _connect_all(self) -> Dict[str, GMatrixHttpApi]:
        jobs = {
            gevent.spawn(self._connect, server_name, server_url)
            for server_name, server_url in self._known_servers.items()
        }
        gevent.joinall(jobs, raise_error=True)
        log.info("All servers connected")
        return {server_name: matrix_api for server_name, matrix_api in (job.get() for job in jobs)}

    def _connect(self, server_name: str, server_url: str) -> Tuple[str, GMatrixHttpApi]:
        log.debug("Connecting", server=server_name)
        api = GMatrixHttpApi(server_url)
        username = self._username
        password = self._password

        if server_name != self._own_server_name:
            signer = make_signer()
            username = str(to_normalized_address(signer.address))
            password = encode_hex(signer.sign(server_name.encode()))

        response = api.login("m.login.password", user=username, password=password)
        api.token = response["access_token"]
        log.debug("Connected", server=server_name)
        return server_name, api


@click.command()
@click.option("--own-server", required=True)
@click.option(
    "-i",
    "--interval",
    default=3600,
    help="How often to perform the room check. Set to 0 to disable.",
)
@click.option("-l", "--log-level", default="INFO")
@click.option("-c", "--credentials-file", required=True, type=click.File("rt"))
def main(own_server: str, interval: int, credentials_file: TextIO, log_level: str) -> None:
    configure_logging(
        {"": log_level, "raiden": log_level, "__main__": log_level}, disable_debug_logfile=True
    )
    known_servers_url = os.environ.get(ENV_KEY_KNOWN_SERVERS)

    try:
        credentials = json.loads(credentials_file.read())
        username = credentials["username"]
        password = credentials["password"]

    except (JSONDecodeError, UnicodeDecodeError, OSError, KeyError):
        log.exception("Invalid credentials file")
        sys.exit(1)

    while True:
        try:
            room_ensurer = RoomEnsurer(username, password, own_server, known_servers_url)
        except MatrixError:
            log.exception("Failure while communicating with matrix servers. Retrying in 60s")
            gevent.sleep(60)
            continue

        try:
            room_ensurer.ensure_rooms()
        except EnsurerError:
            log.error("Retrying in 60s.")
            gevent.sleep(60)
            continue

        if interval == 0:
            break

        log.info("Run finished, sleeping.", duration=interval)
        gevent.sleep(interval)


if __name__ == "__main__":
    main()  # pylint: disable=no-value-for-parameter
