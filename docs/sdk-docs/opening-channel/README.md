# Opening a Channel

To connect to the Raiden Network, you simply make a transaction to open a channel on-chain with a given partner on a registered token network. You can also specify a `settleTimeout`, which will be the number of blocks you and your partner will need to wait after closing a channel to be able to settle it and actually get the due tokens back. `settleTimeout` defaults to `500`

```
import { RaidenChannel } from 'raiden-ts';

# logs channels$ changes
raiden.channels$.subscribe(
  (channels: { [token: string]: { [partner: string]: RaidenChannel } }) =>
    console.log('Raiden channels:', channels)
);

# get list of registered tokens
await raiden.getTokenList();
# ['0xtoken']

# open a Raiden payment channel!
const openTxHash = await raiden.openChannel('0xtoken', '0xpartner');

## output:
# Raiden channels: {
#   '0xtoken': {
#     '0xpartner': {
#       token: '0xtoken',
#       tokenNetwork: '0xtokenNetwork',
#       partner: '0xpartner',
#       state: 'open',
#       ownDeposit: BigNumber(0),
#       partnerDeposit: BigNumber(0),
#       id: 123,
#       settleTimeout: 500,
#       openBlock: 5123,
#       balance: BigNumber(0),
#       capacity: BigNumber(0),
#     }
#   }
# }
```