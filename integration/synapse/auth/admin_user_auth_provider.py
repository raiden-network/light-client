import json
import logging
from json import JSONDecodeError
from pathlib import Path

from twisted.internet import defer


class AdminUserAuthProvider:
    __version__ = "0.1"

    def __init__(self, config, account_handler):
        self.account_handler = account_handler
        self.log = logging.getLogger(__name__)
        if "credentials_file" not in config:
            raise RuntimeError("Config setting 'credentials_file' is missing.")
        credentials_file = Path(config["credentials_file"])
        if not credentials_file.exists():
            raise RuntimeError(f"Credentials file '{credentials_file}' is missing.")
        try:
            self.credentials = json.loads(credentials_file.read_text())
        except (JSONDecodeError, UnicodeDecodeError, OSError) as ex:
            raise RuntimeError(
                f"Could not read credentials file '{credentials_file}': {ex}"
            ) from ex

        msg = "Keys 'username' and 'password' expected in credentials."
        assert "username" in self.credentials, msg
        assert "password" in self.credentials, msg

    @defer.inlineCallbacks
    def check_password(self, user_id: str, password: str):
        if not password:
            self.log.error("No password provided, user=%r", user_id)
            defer.returnValue(False)

        username = user_id.partition(":")[0].strip("@")
        if username == self.credentials["username"] and password == self.credentials["password"]:
            self.log.info("Logging in well known admin user")
            user_exists = yield self.account_handler.check_user_exists(user_id)
            if not user_exists:
                self.log.info("First well known admin user login, registering: user=%r", user_id)
                user_id = yield self.account_handler._hs.get_registration_handler().register_user(
                    localpart=username, admin=True
                )
                _, access_token = yield self.account_handler.register_device(user_id)
                yield user_id, access_token
            defer.returnValue(True)

        self.log.error("Unknown user '%s', ignoring.", user_id)
        defer.returnValue(False)

    @staticmethod
    def parse_config(config):
        return config
