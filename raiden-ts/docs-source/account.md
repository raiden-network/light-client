# Managing various Account Related functions

As we saw previously there are two accounts one is our main account and other is the raiden account.

- _Main Account_ is the account which is currently your metamask account and the account which you use to generate the subkey or raiden account on the connect screen.
- _RAIDEN Account_ is the account which is generated deterministically each time at the start of the light client by signing a combination of the below information by the _Main Account_
  1. **network id** (like goerli, mainnet etc)
  2. **Raiden dApp URL** (like `https://lightclient.raiden.network/staging`, `https://lightclient.raiden.network` or even `http://localhost:8080`)

It is the _RAIDEN Account_ which is used to sign the _balance proofs_ as well as any other message which is used to make micro-payments on the raiden network. If you wish to receive micro-payments in a particular token network you would give them the address of your _RAIDEN Account_ to receive the tokens. If you send someone micro-payments in the raiden network they would see the address of your _RAIDEN Account_ as the sender of the payment and not the _Main Account_.

## Account screen

If you click the coloured identicon on the top right hand corner of the raiden dApp you will get the account screen

![account-screen](https://user-images.githubusercontent.com/15123108/102340538-ac2d8d00-3fbc-11eb-83bd-b5624a3c574f.png 'Account Screen')

On the account screen we see the address of the _RAIDEN Account_, the _Main Account_ ETH Balance as well as _RAIDEN Account_ ETH Balance along with following screens for specific functions:

### Transfer ETH

You require ETH to withdraw either of these tokens:

- _service tokens_ (like _SVT_ on goerli or _RDN_ on mainnet) or
- tokens that you've used to open a channel with your partners (_TTT_ or any TestToken on testnets or _DAI_ _WETH_ on the mainnet).

The transaction of withdrawing or deposting tokens would be an on-chain transaction.
Using the cyclical arrow keys next to the amount you could control which account is the payor or payee.

![transfer-eth-account](https://user-images.githubusercontent.com/15123108/102342273-0596bb80-3fbf-11eb-952c-c65b61a9d47a.png 'Transfer ETH Account')

### Withdraw Tokens

You may not see tokens at the present moment. You will see tokens here in two cases:

1. Withdrawing tokens from any of the channels you have open. You make payments to your partners in these tokens anywhere in the raiden network.
2. Withdrawing tokens from the _UDC contract_ which is used as an escrow to pay the [raiden services](https://raiden-network.readthedocs.io/en/latest/raiden_services.html) namely the _PFS_ and the _MS_

![withdraw-tokens](https://user-images.githubusercontent.com/15123108/102354467-9de96c00-3fd0-11eb-8f3e-27a473abe335.png 'Withdraw tokens')

### Manage UDC Tokens

This screen shows you the amount of the service tokens you have deposited in escrow in the _UDC Contract_ to pay for the raiden services.

![manage-udc-tokens](https://user-images.githubusercontent.com/15123108/102347600-9fae3200-3fc6-11eb-9815-212095be0b96.png 'Manage UDC Tokens')

The actions you can do on this screen are:

1. _Deposit_ which is an on-chain transaction to replenish your service token balance to pay for raiden services.
2. _Withdraw_ which is an on-chain transaction by which you can get back your service tokens to the _RAIDEN Account_. These tokens will show up on the _Withdraw Tokens_ screen which we described earlier. On the _Withdraw Tokens_ screen you can transfer the tokens to your _Main Account_

### Backup State

All the off-chain transfers, ethereum events data along with all the account information except the _private key_ is held in the indexed database of the browser that you run the raiden dApp. You could use this backup data to start off in some other browser on some other machine and uploading the data again.
![backup-state](https://user-images.githubusercontent.com/15123108/102349148-e866ea80-3fc8-11eb-99c1-d78b8ae6a6ba.png 'Backup State')

### Download logs

This will usually trigger a download for the logs of the raiden dApp. You can use this anytime you encounter an error while using the dApp and open an issue.
