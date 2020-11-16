# Closing a Channel

Only close a channel if you really don't plan on using the respective channel anymore.

```typescript
await raiden.closeChannel('0xtoken', '0xpartner')
# resolves to close transaction hash, after it is mined

## channels$ output:
# Raiden channels: {
#   '0xtoken': {
#     '0xpartner': {
#       token: '0xtoken',
#       tokenNetwork: '0xtokenNetwork',
#       partner: '0xpartner',
#       state: 'closed',
#       ownDeposit: BigNumber(100),
#       partnerDeposit: BigNumber(0),
#       id: 123,
#       settleTimeout: 500,
#       openBlock: 5123
#       closeBlock: 5999,
#       balance: BigNumber(-10),
#       capacity: BigNumber(90),
#     }
#   }
# }
```