# Managing Various Account Related Functions

As we saw previously there are two accounts, our main account and the raiden account.

- _Main Account_ is your current MetaMask account and the account which is used for generating the Subkey or Raiden account.
- The _Raiden Account_ is generated deterministically on each start of the Light Client by letting the _Main Account_ sign a combination of the below information:
  1. **network id** (Goerli, Mainnet, etc.)
  2. **Raiden dApp URL** (i.e. `https://lightclient.raiden.network/staging`, `https://lightclient.raiden.network` or even `http://localhost:8080`)

The _Raiden Account_ is used to sign the _balance proofs_ and any other messages when making micro-payments on the Raiden network. The address of the Raiden Account is used when sending and receiving micro-payments in the Raiden network.

## Account Screen

Access the account screen by clicking the identicon on the top right hand corner of the dApp.

![account-screen](https://user-images.githubusercontent.com/15123108/102340538-ac2d8d00-3fbc-11eb-83bd-b5624a3c574f.png 'Account Screen')

On the account screen the address of the _Raiden Account_, the _Main Account_ ETH Balance as well as _RAIDEN Account_ ETH Balance is displayed along with the following menu items:

### Transfer ETH

ETH is required for withdrawing either of the following tokens from a Raiden Account back to the Main Account:

- _Service tokens_ (like _SVT_ on Goerli or _RDN_ on Mainnet) or
- tokens that have been used to open any channels, i.e. (_TTT_ or any other TestToken on testnets or _DAI_ and _WETH_ on Mainnet).

You can transfer ETH in either direction, from your Main Account to your Raiden Account or vice versa.

![transfer-eth-account](https://user-images.githubusercontent.com/15123108/102342273-0596bb80-3fbf-11eb-952c-c65b61a9d47a.png 'Transfer ETH Account')

### Withdraw Tokens

Tokens are displayed on this screen if:

1. Any tokens have been withdrawn from a channel.
2. Any tokens have been withdrawn from the UDC.

![withdraw-tokens](https://user-images.githubusercontent.com/15123108/102354467-9de96c00-3fd0-11eb-8f3e-27a473abe335.png 'Withdraw tokens')

### Manage UDC Tokens

This screen shows the amount of service tokens deposited in the _UDC_ which are used for paying the Raiden services.

![manage-udc-tokens](https://user-images.githubusercontent.com/15123108/102347600-9fae3200-3fc6-11eb-9815-212095be0b96.png 'Manage UDC Tokens')

On the UDC screen you can choose to:

1. _*Deposit*_: This is an on-chain transaction in which to top-up the service token balance.
2. _*Withdraw*_: This is an on-chain transaction  which would withdraw service tokens back on to the _Raiden Account_. These tokens will appear on the _Withdraw Tokens_ screen from where they can be transfered back on to the _Main Account_.

### Backup State

All the off-chain transfers, ethereum events data along with all the account information except the _private key_ is held in the indexed database of the browser that you run the raiden dApp. You could use this backup data to start off in some other browser on some other machine and uploading the data again.
![backup-state](https://user-images.githubusercontent.com/15123108/102349148-e866ea80-3fc8-11eb-99c1-d78b8ae6a6ba.png 'Backup State')

### Download logs

This triggers a download of the logs for the dApp. You can use this anytime you encounter an error and open an [issue](https://github.com/raiden-network/light-client/issues/new/choose).
