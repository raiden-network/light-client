# Settling a Channel

As we can't perform a cooperative close yet, once your channel is closed, there is a grace period of `settleTimeout` blocks during which the counterpart can claim a higher signed balance proof sent by you. Only the tokens you transferred can be claimed by your partner. After `settleTimeout` blocks, your channel's state automatically becomes `settleable`, which is like `closed` but when settle can be called:

```typescript
await raiden.settleChannel('0xtoken', '0xpartner')
# resolves to settle transaction hash, after it is mined

## channels$ output:
# Raiden channels: {
#   '0xtoken': {}
# }
```

Once channel is settled, it's gone from mapping, and you can open the channel again, if desired.
