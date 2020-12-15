# Hub Selection and Channel Opening

Once you sign the MetaMask prompt to create a Raiden Account you will come to a screen where you will be prompted to connect a new token. You might also get a snackbar at the botton of the screen informing you that receiving transfers is disabled.

> Receiving Transfers disabled - this is a security feature and a notification is  
> given when there are not enough funds to pay for the Raiden services, like the
> [monitoring service](https://raiden-network-specification.readthedocs.io/en/latest/monitoring_service.html)

---

![Select-Hub](https://user-images.githubusercontent.com/15123108/102077805-e0277780-3e2f-11eb-86ab-cdbf060aba6b.gif 'Select Hub gif')

## Select Hub

![Select-Hub-screen](https://user-images.githubusercontent.com/15123108/102077868-faf9ec00-3e2f-11eb-8a5d-a5df28c4f860.png 'Select Hub screen')

On the _Select Hub_ screen There are two tokens available which will briefly be described here:

1. _SVT_ tokens(**RDN** tokens on mainnet)
2. _TTT_ TestToken (**DAI** or **WETH** on the mainnet)

The _SVT_ token which is the service token is used to be pay for accessing the Raiden services, _PFS_ (Path Finding Service) and _MS_ (Monitoring Service). For testnets the service tokens can be minted and then deposited to the _UDC_ contract directly in the Raiden dApp. This is done by clicking the button on the right side next to the token amount.

The _TTT_ TestToken is the token which will be used for transactions with a counterparty when sending or receiving micropayments. The _BALANCE_ indicates the token balance, on the testnet the token can be minted by clicking on the button to the right of the amount.

The _HUB_ is usually a well connected node with whom you can open a channel with.
If well connected hubs are available for the token network, a list of the top three are suggested. You can go ahead and open channels with any of the suggested hubs, or if you know any node in the network you can open a channel by entering the address of that node.

## Mint or Acquire Tokens

![Mint-SVT-TTT](https://user-images.githubusercontent.com/15123108/102077942-15cc6080-3e30-11eb-964b-90e0441fa6e7.png 'Mint SVT and TTT tokens')

Minting tokens can only be done on testnets and not on mainnet.
On Goerli, for instance, that would be the  _SVT_ and _TTT_ token (or any other token chosen token which supports minting).

On mainnet, the tokens needs to be acquired independently. The dApp assists in this by providing links to services such as Uniswap where tokens can be acquired.

![After-minting-select-hub](https://user-images.githubusercontent.com/15123108/102078028-41e7e180-3e30-11eb-90bf-9c5b7df8ed2c.png 'After minting select hub screen')

After minting the screen should look something like above.

## Opening a Channel With the Hub

![select-hub-button-click](https://user-images.githubusercontent.com/15123108/102078097-5b892900-3e30-11eb-9061-10205ee6fd78.gif 'Select hub button click')

After entering the address of the hub click on _Select hub_ and on the next screen enter the amount which to allocate in the channel. Sign the required transactions on MetaMask. When a channel has been opened you will end up on the _Transfer_ screen.

![Transfer-screen-after-select-hub](https://user-images.githubusercontent.com/15123108/102078186-7eb3d880-3e30-11eb-87d3-ab342f062a9e.png 'Transfer screen')

Next to the capacity of the channel (**1.0 TTT** in the example above), the 3 dots menu can be clicked to access the _DEPOSIT_ and _CHANNELS_ options. If the _CHANNELS_ option is clicked a list of available channels is displayed.

![channel-screen](https://user-images.githubusercontent.com/15123108/102078250-9ee39780-3e30-11eb-975b-ecaeb6a8e2c7.png 'Channels Screen')
