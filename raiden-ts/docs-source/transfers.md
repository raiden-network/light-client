# Making Transfers on the dapp

Transfers are off chain payments which raiden nodes make with each other by exchanging messages.
These are backed by deposits on-chain. When you open a channel you also deposited an amount in the channel which is locked in the token network contract.

We could pay directly to the hub that we opened a channel with or we could pay to anyone else who has a channel with the hub or any node in the chain connected to the hub and indirectly to us via channels.

![raiden-network](https://user-images.githubusercontent.com/15123108/102085833-2d5e1600-3e3d-11eb-917b-eb5311fa118a.png 'Network Visualisation')

Lets walk through how to make a transfer through the dapp

## Direct transfer

If we transfer an amount directly to the hub it is a direct transfer. On the transfer screen we can enter the address and amount and hit continue.

![direct-transfer](https://user-images.githubusercontent.com/15123108/102086318-e9b7dc00-3e3d-11eb-8a1b-cbb4f64034f8.png 'Direct Transfer')

This a direct transfer hence it does not go for route selection. The screen confirms the direct transfer and you could click `Transfer 0.2 TTT` at the bottom to transfer the amount.

![direct-transfer-confirm](https://user-images.githubusercontent.com/15123108/102086680-782c5d80-3e3e-11eb-82a9-b3b7de65a82e.png 'Direct Transfer Confirm')

After getting a dialogue regarding various messages being exchanged by the nodes the dapp will again bring you back to the transfer screen showing the history of the just concluded direct transfer

![after-direct-transfer](https://user-images.githubusercontent.com/15123108/102087290-541d4c00-3e3f-11eb-9719-397f51e95645.png 'After Direct Transfer')

## Mediated transfer

On the transfer screen enter the address of a node which has a connection with the hub node. At a later time in the raiden network with highly connected hubs it would mostly be assumed that each node would most probably be connected to a hub and all hubs would be connected with one another.

![mediated-transfer](https://user-images.githubusercontent.com/15123108/102088064-65b32380-3e40-11eb-8523-06501ea783a4.png 'Mediated Transfer')

### Request Route

At the request route screen the Path Finding Service with the address and price is indicated.
Since this is a test environment we have only one PFS but on the mainnet Path Finding Services with competitive prices would be available. Now you can click on `Confirm PFS Fee of <0.000001 SVT >` to confirm your choice of PFS.

![request-route-pfs](https://user-images.githubusercontent.com/15123108/102089472-44533700-3e42-11eb-8491-6535b700faf3.png 'Request Route PFS')

### Select Route

At the select route screen the number of hops along with the price that we get from the PFS is indicated. In a highly interconnected network there would be many routes that we get from the PFS and we could make a choice from these. In the testnet environment the one hop route is selected for us and we could proceed by clicking `Confirm Mediation Fee of ≈0.001839 TTT` at the bottom.

![select-route](https://user-images.githubusercontent.com/15123108/102181893-57611800-3ed1-11eb-976a-1cbe361cef38.png 'Select Route')

### Confirm Transfer

At the confirm transfer screen a brief summary of your transfer with all the fees to be paid is shown here. If you observe closely there are 2 types of fees that you are paying here so lets list them below.

![confirm-transfer](https://user-images.githubusercontent.com/15123108/102183697-3cdc6e00-3ed4-11eb-85cd-bb95c787a48d.png 'Confirm Transfer')

1. _PATH FINDING SERVICE FEE_ is the fees that you pay to the PFS for providing you with all available routes for your transfer. This fee is paid from the _SVT tokens_ (on mainnet the RDN tokens) that you deposited to the [UDC contract](https://raiden-network-specification.readthedocs.io/en/latest/service_contracts.html) earlier.

2. _Mediation Fee_ is the fees that you pay to the mediating nodes to forward your transfer. Forwarding your transfer is similar to a direct transfer for mediating nodes with their partner nodes which reduces their capacity in the send direction of their channel with their partner node. This fee is to be paid in the same token (_TTT_ here) that you are sending to the target.

After being satisfied with the summary you could click on `Transfer ≈0.201839 TTT` and proceed

### After transfer

After a dialogue showing all the messages getting exchanged you will be brought to the transfer screen again.

![after-mediated-transfer](https://user-images.githubusercontent.com/15123108/102209131-52fb2600-3ef6-11eb-939e-3e4554c637fd.png 'After Mediated Transfer')
