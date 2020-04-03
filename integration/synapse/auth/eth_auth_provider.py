# Put this file in a place accessible by the synapse server

# Enable it in homeserver's config with:
# password_providers:
#   - module: 'eth_auth_provider.EthAuthProvider'
#     config:
#       enabled: true

# If desired, disable registration, to only allow auth through this provider:
# enable_registration: false

# user_id must be in the format: @0x<eth_address>:<homeserver>
# password must be hex-encoded `eth_sign(<homeserver_hostname>)`

import logging
import re
from binascii import unhexlify
from typing import Callable

from coincurve import PublicKey
from Crypto.Hash import keccak
from twisted.internet import defer

__version__ = "0.1"
logger = logging.getLogger(__name__)


def _sha3(data: bytes) -> bytes:
    k = keccak.new(digest_bits=256)
    k.update(data)
    return k.digest()


def _eth_sign_sha3(data: bytes) -> bytes:
    """
    eth_sign/recover compatible hasher
    Prefixes data with "\x19Ethereum Signed Message:\n<len(data)>"
    """
    prefix = b"\x19Ethereum Signed Message:\n"
    if not data.startswith(prefix):
        data = b"%s%d%s" % (prefix, len(data), data)
    return _sha3(data)


def _recover(
    data: bytes, signature: bytes, hasher: Callable[[bytes], bytes] = _eth_sign_sha3
) -> bytes:
    """ Returns account address in canonical format which signed data """
    if len(signature) != 65:
        logger.error("invalid signature")
        return b""
    if signature[-1] >= 27:
        signature = signature[:-1] + bytes([signature[-1] - 27])
    try:
        publickey_bytes = PublicKey.from_signature_and_message(
            signature, data, hasher=hasher
        ).format(compressed=False)
    except Exception as e:
        # secp256k1 is using bare Exception cls: raised if the recovery failed
        logger.error("error while recovering pubkey: %s", e)
        return b""

    address = _sha3(publickey_bytes[1:])[12:]
    return address


class EthAuthProvider:
    __version__ = "0.1"
    _user_re = re.compile(r"^@(0x[0-9a-f]{40}):(.+)$")
    _password_re = re.compile(r"^0x[0-9a-f]{130}$")

    def __init__(self, config, account_handler):
        self.account_handler = account_handler
        self.config = config
        self.hs_hostname = self.account_handler._hs.hostname
        self.log = logging.getLogger(__name__)

    @defer.inlineCallbacks
    def check_password(self, user_id: str, password: str):
        if not password:
            self.log.error("No password provided, user=%r", user_id)
            defer.returnValue(False)

        if not self._password_re.match(password):
            self.log.error(
                "Invalid password format, must be 0x-prefixed hex, "
                "lowercase, 65-bytes hash. user=%r",
                user_id,
            )
            defer.returnValue(False)

        signature = unhexlify(password[2:])

        user_match = self._user_re.match(user_id)
        if not user_match or user_match.group(2) != self.hs_hostname:
            self.log.error(
                "Invalid user format, must start with 0x-prefixed hex, "
                "lowercase address. user=%r",
                user_id,
            )
            defer.returnValue(False)

        user_addr_hex = user_match.group(1)
        user_addr = unhexlify(user_addr_hex[2:])

        rec_addr = _recover(data=self.hs_hostname.encode(), signature=signature)
        if not rec_addr or rec_addr != user_addr:
            self.log.error(
                "Invalid account password/signature. user=%r, expected=%r, recovered=%r",
                user_id,
                user_addr,
                rec_addr,
            )
            defer.returnValue(False)

        localpart = user_id.split(":", 1)[0][1:]
        self.log.info("Eth login, valid signature. user=%r", user_id)

        if not (yield self.account_handler.check_user_exists(user_id)):
            self.log.info("First user login, registering: user=%r", user_id)
            yield self.account_handler.register(localpart=localpart)

        defer.returnValue(True)

    @staticmethod
    def parse_config(config):
        return config
