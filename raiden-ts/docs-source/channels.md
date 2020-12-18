# Raiden Channels

On the transfer screen if you click the **3 dot** menu where you see the token capacity and click on _CHANNELS_ you will come to the channel screen.

![channel-screen](https://user-images.githubusercontent.com/15123108/102078250-9ee39780-3e30-11eb-975b-ecaeb6a8e2c7.png 'Channel Screen')

The channel information shown is the

1. account address of your partner
2. the channel `capacity`
3. the `state`
4. the down arrow indicating `deposit` to the channel
5. the up arrow indicating `withdraw` from the channel
6. the `close` button indicating closing of the offchain micro-payment network with your partner which will kick off a timer which will eventually tranform to a `settle` button. Clicking this you can settle accounts and get back your deposit inside the channel.

## Deposit Tokens

Depositing tokens inside the channel is an on-chain transaction which would increase the capacity of the channel which means you can transfer more tokens to your partner or anyone inside the raiden network. You can deposit in the channel anytime you like till the channel is open.

## Withdraw Tokens

Withdrawing tokens inside the channel is also an on-chain transaction which would decrease the capacity of the channel which means you can transfer fewer tokens to your partner or anyone inside the raiden network. You can withdraw tokens anytime you like till the channel open.
Tokens withdrawn from the channels will be seen on the `Withdraw tokens` screen.
