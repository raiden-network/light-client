import json
import logging
from json import JSONDecodeError
from pathlib import Path
from typing import Any


class AdminUserAuthProvider:
    __version__ = "0.1"

    def __init__(self, config, account_handler) -> None:  # type: ignore
        self.account_handler = account_handler
        self.log = logging.getLogger(__name__)
        if "credentials_file" in config:
            credentials_file = Path(config["credentials_file"])
            if not credentials_file.exists():
                raise AssertionError(f"Credentials file '{credentials_file}' is missing.")
            try:
                self.credentials = json.loads(credentials_file.read_text())
            except (JSONDecodeError, UnicodeDecodeError, OSError) as ex:
                raise AssertionError(
                    f"Could not read credentials file '{credentials_file}': {ex}"
                ) from ex
        elif "admin_credentials" in config:
            self.credentials = config["admin_credentials"]
        else:
            raise AssertionError(
                "Either 'credentials_file' or 'admin_credentials' must be specified in "
                "auth provider config."
            )

        msg = "Keys 'username' and 'password' expected in credentials."
        assert "username" in self.credentials, msg
        assert "password" in self.credentials, msg

    async def check_password(self, user_id: str, password: str) -> bool:
        if not password:
            self.log.error("No password provided, user=%r", user_id)
            return False

        username = user_id.partition(":")[0].strip("@")
        if username == self.credentials["username"] and password == self.credentials["password"]:
            self.log.info("Logging in well known admin user")
            user_exists = await self.account_handler.check_user_exists(user_id)
            if not user_exists:
                self.log.info("First well known admin user login, registering: user=%r", user_id)
                await self.account_handler._hs.get_registration_handler().register_user(
                    localpart=username, admin=True
                )
            return True
        return False

    @staticmethod
    def parse_config(config: Any) -> Any:
        return config
