# Hub Selection and Channel Opening

Once you sign the metamask prompt to create the raiden account you will come to a screen where you would be prompted to `Connect New Token` with a plus sign. Along with that you might get a snackbar at the botton of your screen which informs you that `Receiving Transfers disabled`.

> Receiving Transfers disabled - this is a security feature and a notification is  
> given because still you have'nt paid for raiden services especially the
> [monitoring service](https://raiden-network-specification.readthedocs.io/en/latest/monitoring_service.html)

---

![Select-Hub](media://connect-to-select-hub-screen.gif 'Select Hub gif')

## Select Hub

![Select-Hub-screen](media://select_hub.png 'Select Hub screen')

On the _Select Hub_ screen There are two tokens involved here and we will briefly describe them:

1. _SVT_ tokens(**RDN** tokens on mainnet)
2. _TTT_ TestToken (**DAI** or **WETH** on the mainnet)

The _SVT_ token which is the service token will have to be paid for to access the raiden services namely the _PFS_(Path Finding Service) and _MS_(Monitoring Service). For goerli the tokens can be minted and then deposited to the _UDC_ contract which will be done by the raiden dapp for you when you click on the button on the right side where the token amounts are mentioned.

The _TTT_ Testtoken is the token which you will transact with your counterparty or partner and send or receive micropayments. The _BALANCE_ indicates the _TTT_ token balance and on goerli testnet this can be minted by clicking on the button to the right of the amount.

The _HUB_ is usually a well connected node with whom you can open a channel with. At this point
the node address is prepopulated with the address of a running raiden node on our infrastructure. You can go ahead and open channels with this node or if you know any node in the network or you yourself run your own raiden node you can enter the address of that node here and proceed.

## Mint or Acquire tokens

![Mint-SVT-TTT](media://mint_udc_ttt_combined.png 'Mint SVT and TTT tokens')

Needless to say that minting facility will not be available for the tokens on the mainnet.
On goerli testnet you can mint both the _SVT_ and _TTT_ token(or any other token if you've chosen something else and you have counterparties you can open channels with are also on the same token network)

For the mainnet you would need to acquire these tokens independently though the raiden dapp would help by giving you links to services such as Uniswap where you could get the required tokens.

![After-minting-select-hub](media://after_minting_select_hub.png 'After minting select hub screen')

After minting both the tokens the screen should look somewhat like above.

## Opening a channel with the hub

![select-hub-button-click](media://select-button-click.gif 'Select hub button click')

Once entering the address of the hub click on _Select hub_ then on the next screen enter the amount which would be locked in the channel, sign the required transactions on metamask. Finally you would end up on the _Transfer_ screen

![Transfer-screen-after-select-hub](media://transfer_screen_after_select_hub.png 'Transfer screen')

On the box which shows the capacity of the channel we see here **1.0 TTT**, if we click the 3 dots we get 2 options _DEPOSIT_ and _CHANNELS_ and if we click on _CHANNELS_ we would see the channel with the hub is opened.

![channel-screen](media://channels_screen.png 'Channels Screen')
