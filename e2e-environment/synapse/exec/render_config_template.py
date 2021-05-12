import json
import os
import random
import string
from pathlib import Path
from eth_typing import ChecksumAddress
from eth_utils import to_checksum_address

PATH_CONFIG = Path("/opt/synapse/config/synapse.yaml")
PATH_CONFIG_TEMPLATE = Path("/opt/synapse/config/synapse.template.yaml")
PATH_MACAROON_KEY = Path("/opt/synapse/data/keys/macaroon.key")
PATH_ADMIN_USER_CREDENTIALS = Path("/opt/synapse/config/admin_user_cred.json")
PATH_KNOWN_FEDERATION_SERVERS = Path("/opt/synapse/data/known_federation_servers.yaml")
PATH_WELL_KNOWN_FILE = Path("/opt/synapse/data_well_known/server")


def get_macaroon_key() -> str:
    if not PATH_MACAROON_KEY.exists():
        alphabet = string.digits + string.ascii_letters + "!@#$%^&*()_-=+{}[]"
        macaroon = "".join(random.choice(alphabet) for _ in range(30))
        PATH_MACAROON_KEY.write_text(macaroon)
    else:
        macaroon = PATH_MACAROON_KEY.read_text()
    return macaroon


def render_synapse_config(
    server_name: str,
    eth_rpc_url: str,
    service_registry_address: ChecksumAddress,
) -> None:
    template_content = PATH_CONFIG_TEMPLATE.read_text()
    rendered_config = string.Template(template_content).substitute(
        MACAROON_KEY=get_macaroon_key(),
        SERVER_NAME=server_name,
        ETH_RPC=eth_rpc_url,
        SERVICE_REGISTRY=service_registry_address,
    )
    PATH_CONFIG.write_text(rendered_config)


def render_well_known_file(server_name: str) -> None:
    content = {"m.server": f"{server_name}:443"}
    PATH_WELL_KNOWN_FILE.write_text(json.dumps(content, indent=2))


def generate_admin_user_credentials():
    """
    Generate the username "admin-{server-name}" and a random password combination
    that will be used by various tools in the
    package to authenticate as an admin user via the ``AdminUserAuthProvider``.
    """
    if PATH_ADMIN_USER_CREDENTIALS.exists():
        return
    username = f"admin-{os.environ['SERVER_NAME']}"
    password = "".join(random.choice(string.digits + string.ascii_lowercase) for _ in range(30))
    PATH_ADMIN_USER_CREDENTIALS.write_text(
        json.dumps({"username": username, "password": password})
    )


def main() -> None:
    server_name = os.environ["SERVER_NAME"]
    eth_rpc_url = os.environ["ETH_RPC"]
    service_registry_address = to_checksum_address(os.environ["SERVICE_REGISTRY"])

    render_synapse_config(
        server_name=server_name,
        eth_rpc_url=eth_rpc_url,
        service_registry_address=service_registry_address,
    )
    render_well_known_file(server_name=server_name)
    generate_admin_user_credentials()


if __name__ == "__main__":
    main()
