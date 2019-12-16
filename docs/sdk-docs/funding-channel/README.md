# Funding a Channel

If you intend to perform transfers via a channel, you need to first lock a given amount of tokens in it. Note that these tokens aren't transferred yet to the partner, and the custody is fully yours. It just locks this amount on-chain so your partner can be sure a given transfer can be claimed.

```typescript
raiden.depositChannel('0xtoken', '0xpartner', 100);

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
#       balance: BigNumber(0), // total received minus sent
#       capacity: BigNumber(100), // current spendable amount on channel
#     }
#   }
# }
```