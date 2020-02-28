# Direct Transfer

This is where the fun begins: off-chain transfers!

The main point of information about past and pending transfers is the `transfers$: Observable<RaidenTransfer>` observable. It'll first emit all known past transfers at subscription time (history), then emit again each time a transfer state changes, allowing you to keep track of the transfer status. The [Raiden.transfer](https://github.com/raiden-network/light-client/blob/dfe87e1886b12fc9f85857b01e28db5e81cc5070/raiden-ts/src/raiden.ts#L693) method is used to initiate an outgoing transfer, and returned Promise will reject with an Error if transfer signature prompt is cancelled or resolve with the `secrethash` value (a transfer unique key) as soon as it's registered. You can use this `secrethash` property of the objects emitted by `transfers$` as a unique key to keep track of specific transfers.

```typescript
import { RaidenTransfer } from 'raiden-ts';

const transfers: { [secrethash: string]: RaidenTransfer } = {};
raiden.transfers$.subscribe(transfer => {
  transfers[transfer.secrethash] = transfer;
  console.log('Transfers updated:', transfers);
});
const secrethash: string = await raiden.transfer('0xtoken', '0xtarget', 10);

## channels$ output, as balance & capacity are updated:
# Raiden channels: {
#   '0xtoken': {
#     '0xpartner': {
#       token: '0xtoken',
#       tokenNetwork: '0xtokenNetwork',
#       partner: '0xpartner',
#       state: 'open',
#       ownDeposit: BigNumber(100),
#       partnerDeposit: BigNumber(0),
#       id: 123,
#       settleTimeout: 500,
#       openBlock: 5123
#       balance: BigNumber(-10), // you spent 10 tokens
#       capacity: BigNumber(90), // capacity is reduced as well
#     }
#   }
# }

## transfers$ output:
# Transfers updated: {
#   [secrethash]: {
#     secrethash,
#     status: 'PENDING', // see RaidenTransferStatus enum imported from 'raiden-ts'
#     initiator: '0xourAddress'
#     recipient: '0xpartner',
#     target: '0xtarget',
#     paymentId: BigNumber(99123), // auto-generated if not passed as `opts.paymentId` to transfer
#     chainId, // channel info
#     token: '0xtoken',
#     tokenNetwork: '0xtokenNetwork',
#     channelId: 123,
#     amount: BigNumber(10),
#     expirationBlock: 5223,
#     fee: BigNumber(0),
#     startedAt: new Date(1566929562387),
#     changedAt: new Date(1566929562387),
#     success: undefined, // set as soon as known if transfer was revealed or failed
#     completed: false, // true after no more actions are pending for this transfer
#   }
# }

```