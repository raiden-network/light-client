 s2o# Navigate the dApp

To get familiarized with the dApp, a brief introduction to some of the screens are given in the following sections to describe common interactions with the dApp.

There are three ways to connect to the dApp:

- Using an injected provider
- Using WalletConnect
- Using a direct RPC provider

### Connect using Injected Provider

1. Make sure a Web3 provider is available in the browser, e.g. MetaMask.
2. Click on **Injected Provider**.
3. Click on **Connect** and sign the messages necessary for establishing a connection.

### Connect using WalletConnect

WalletConnect can be used for connecting with [supported wallets](https://registry.walletconnect.org/wallets), note that this is an experimental feature which is limited to how well any of the external wallets integrate with WalletConnect.

1. Click on **WalletConnect**.
2. By default a bridge server provided by WalletConnect is used. It is however possible to use an alternative bridge server.
3. Choose to provide either a Infura ID or an RPC endpoint.
4. Click on **Connect**.
5. Scan the QR code using a wallet of your choice and make sure to sign the messages necessary for establishing a connection.

### Connect using Direct RPC Provider

Connect directly to an Ethereum node and use your accounts private key. This approach is **NOT RECOMMENDED** for security reasons since the private key gets stored as plain text in the browsers storage and in memory.

1. Click on **Direct RPC Provider**.
2. Provide an RPC endpoint.
3. Provide the private key of an Ethereum account.
4. Click on **Connect**.
