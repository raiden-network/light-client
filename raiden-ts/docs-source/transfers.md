# Making Transfers on the dApp

Transfers are off-chain payments made between Raiden nodes.
These are backed by deposits on-chain  when a channel is opened and an amount is deposited into the channel.

Transfers can be made directly to the hub or to anyone who has a channel with the hub.

![raiden-network](https://user-images.githubusercontent.com/15123108/102085833-2d5e1600-3e3d-11eb-917b-eb5311fa118a.png 'Network Visualisation')

Let's walk through how to make a transfer in the dApp.

## Direct Transfer

If we transfer an amount directly to a hub it is called a direct transfer. On the transfer screen we can enter the address and amount and hit continue.

![direct-transfer](https://user-images.githubusercontent.com/15123108/102086318-e9b7dc00-3e3d-11eb-8a1b-cbb4f64034f8.png 'Direct Transfer')

This is a direct transfer because it does not get routed. The screen confirms the direct transfer and you can click `Transfer 0.2 TTT` at the bottom to transfer the amount.

![direct-transfer-confirm](https://user-images.githubusercontent.com/15123108/102086680-782c5d80-3e3e-11eb-82a9-b3b7de65a82e.png 'Direct Transfer Confirm')

After the dialogue with messages being exchanged between the nodes the dApp will redirect back to the transfer screen which now displays the transaction as part of the transaction history.

![after-direct-transfer](https://user-images.githubusercontent.com/15123108/102087290-541d4c00-3e3f-11eb-9719-397f51e95645.png 'After Direct Transfer')

## Mediated Transfer

On the transfer screen enter the address of a node which also have a connection with the hub.

![mediated-transfer](https://user-images.githubusercontent.com/15123108/102088064-65b32380-3e40-11eb-8523-06501ea783a4.png 'Mediated Transfer')

### Request Route

At the request route screen the Path Finding Service price is indicated.
Since this is a test environment we only have one PFS but on mainnet, Path Finding Services with competitive prices would be available. Click on `Confirm PFS Fee of <0.000001 SVT >` to confirm your choice of PFS.

![request-route-pfs](https://user-images.githubusercontent.com/15123108/102089472-44533700-3e42-11eb-8491-6535b700faf3.png 'Request Route PFS')

### Select Route

At the select route screen the number of hops along with the price is displayed. In a highly interconnected network there would be many routes to choose from. In the testnet environment the one hop route is selected for us and we could proceed by clicking `Confirm Mediation Fee of ≈0.001839 TTT` at the bottom.

![select-route](https://user-images.githubusercontent.com/15123108/102181893-57611800-3ed1-11eb-976a-1cbe361cef38.png 'Select Route')

### Confirm Transfer

In the confirm transfer screen a brief summary of the transfer with all fees is shown. There are 2 types of fees to pay here:

![confirm-transfer](https://user-images.githubusercontent.com/15123108/102183697-3cdc6e00-3ed4-11eb-85cd-bb95c787a48d.png 'Confirm Transfer')

1. _PATH FINDING SERVICE FEE_ is the fees for the PFS to provide all available routes for your transfer. This fee is paid from the _SVT tokens_ (RDN tokens on mainnet) that were deposited to the [UDC](https://raiden-network-specification.readthedocs.io/en/latest/service_contracts.html) earlier.

2. _Mediation Fee_ is the fees payed to the mediating nodes for forwarding your transfer. This fee is payed in the same token (_TTT_ here) as the one being sent to the target.

After examining the summary, click on `Transfer ≈0.201839 TTT`.

### After transfer

After the dialogue with messages being exchanged between the nodes the dApp will redirect back to the transfer screen which now displays the transaction as part of the transaction history.

![after-mediated-transfer](https://user-images.githubusercontent.com/15123108/102209131-52fb2600-3ef6-11eb-939e-3e4554c637fd.png 'After Mediated Transfer')
