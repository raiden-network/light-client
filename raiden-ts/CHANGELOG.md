# Changelog

## [Unreleased]
### Fixed
- [#2094] Fix TransferState's timestamps missing

### Added
- [#2044] Introduce PouchDB (IndexedDB/leveldown) as new persistent state storage backend

### Changed
- [#2158] Adapt WebRTC to new protocol compatible with python client

[#2044]: https://github.com/raiden-network/light-client/issues/2044
[#2094]: https://github.com/raiden-network/light-client/issues/2094
[#2158]: https://github.com/raiden-network/light-client/issues/2158

## [0.11.1] - 2020-08-18
### Changed
- [#2049] Target ES2019 (NodeJS 12+) on SDK builds
- [#2054] Update to Raiden contracts `v0.37.1`

[#2049]: https://github.com/raiden-network/light-client/issues/2049
[#2054]: https://github.com/raiden-network/light-client/pulls/2054


## [0.11.0] - 2020-08-04
### Fixed
- [#1923] Fix `fromEthersEvent` ranges fetching in case of temporary connectivity loss
- [#1952] Fix nonce conflict issues with concurrent transactions
- [#1997] Fix matrix rate-limiting logins when many nodes are started in parallel
- [#1998] Fix events reverted due to a reorg still getting confirmed
- [#2010] Fix multiple approve on secure ERC20 tokens, like RDN

### Added
- [#237] Add autoSettle config (off by default) to allow auto-settling settleable channels
- [#703] Add option to fetch all contracts addresses from UserDeposit address alone
- [#1710] Add option to specify a transfer's lock timeout
- [#1910] Add option to `mint` tokens for any address
- [#1913] Added `contractsInfo` getter holding current contracts info
- [#1824] Expose channel settle actions as events
- [#2022] Add 'pfsMaxFee', 'pfsMaxPaths' and 'pfsIouTimeout' config options

### Changed
- [#1905] Fail early if not enough tokens to deposit
- [#1958] Transfers can fail before requesting PFS if there's no viable channel
- [#2010] Token.approve defaults to MaxUint256, so only one approval is needed per token; set config.minimumAllowance to Zero to fallback to strict deposit values
- [#2019] Use exponential back-off strategy for protocol messages retries

[#237]: https://github.com/raiden-network/light-client/issues/237
[#703]: https://github.com/raiden-network/light-client/issues/703
[#1710]: https://github.com/raiden-network/light-client/issues/1710
[#1824]: https://github.com/raiden-network/light-client/issues/1824
[#1905]: https://github.com/raiden-network/light-client/issues/1905
[#1910]: https://github.com/raiden-network/light-client/pull/1910
[#1913]: https://github.com/raiden-network/light-client/pull/1913
[#1923]: https://github.com/raiden-network/light-client/issues/1923
[#1952]: https://github.com/raiden-network/light-client/issues/1952
[#1958]: https://github.com/raiden-network/light-client/issues/1958
[#1997]: https://github.com/raiden-network/light-client/issues/1997
[#1998]: https://github.com/raiden-network/light-client/issues/1998
[#2010]: https://github.com/raiden-network/light-client/issues/2010
[#2019]: https://github.com/raiden-network/light-client/issues/2019
[#2022]: https://github.com/raiden-network/light-client/pull/2022
[#2049]: https://github.com/raiden-network/light-client/issues/2049

## [0.10.0] - 2020-07-13
### Fixed
- [#1514] Fix handling of expired LockedTransfer and WithdrawRequest
- [#1607] Fix settling when one side closes/updates with outdated BalanceProof
- [#1637] Fix depositToUDC failing if services already have withdrawn some fees
- [#1651] Fix PFS being disabled if passed an undefined default config
- [#1690] Fix LockExpired with empty balanceHash verification
- [#1698] Fix estimateGas errors on channelOpen not properly being handled
- [#1761] Fix deposit error on openChannel not rejecting promise
- [#1787] Fix TokenNetwork monitoring losing events
- [#1830] Fix a nonce race when openining + depositing concurrently
- [#1848] Fix a Metamask error by retry on deposit
- [#1882] Fix paymentId gets ignored when being falsie (e.g. `0`)

### Added
- [#249] Add withdraw functionality
- [#1374] Monitors MonitoringService contract and emit event when MS acts
- [#1421] Adds support for withdrawing tokens from the UDC
- [#1642] Check token's allowance before deposit and skip approve
- [#1701] Allow parameter decoding to throw and log customized errors
- [#1701] Add and extend error codes for user parameter validation for open channel
- [#1711] Add and extend error codes for user parameter validation for transfer
- [#1835] The presence knowledge for a payment routes target is secured automatically

### Changed
- [#837] Changes the action tags from camel to path format. This change affects the event types exposed through the public API.
- [#1610] Updates smart contracts to v0.37.0 (Alderaan)
- [#1649] Have constant error messages and codes in public Raiden API.
- [#1657] Expose RaidenChannel's id,settleTimeout,openBlock as required properties
- [#1708] Expose RaidenTransfer's secret as optional property
- [#1705] All transfers become monitored per default to make receiving transfers safe
- [#1822] Refactor and optimize TokenNetwork events monitoring: one filter per Tokennetwork
- [#1832] Make Provider events fetching more reliable with Infura

[#249]: https://github.com/raiden-network/light-client/issues/249
[#837]: https://github.com/raiden-network/light-client/issues/837
[#1374]: https://github.com/raiden-network/light-client/issues/1374
[#1421]: https://github.com/raiden-network/light-client/issues/1421
[#1514]: https://github.com/raiden-network/light-client/issues/1514
[#1607]: https://github.com/raiden-network/light-client/issues/1607
[#1610]: https://github.com/raiden-network/light-client/issues/1610
[#1637]: https://github.com/raiden-network/light-client/issues/1637
[#1642]: https://github.com/raiden-network/light-client/issues/1642
[#1649]: https://github.com/raiden-network/light-client/pull/1649
[#1651]: https://github.com/raiden-network/light-client/issues/1651
[#1657]: https://github.com/raiden-network/light-client/issues/1657
[#1690]: https://github.com/raiden-network/light-client/issues/1690
[#1698]: https://github.com/raiden-network/light-client/issues/1698
[#1701]: https://github.com/raiden-network/light-client/pull/1701
[#1708]: https://github.com/raiden-network/light-client/issues/1708
[#1705]: https://github.com/raiden-network/light-client/issues/1705
[#1711]: https://github.com/raiden-network/light-client/pull/1711
[#1761]: https://github.com/raiden-network/light-client/issues/1761
[#1787]: https://github.com/raiden-network/light-client/issues/1787
[#1822]: https://github.com/raiden-network/light-client/pull/1822
[#1830]: https://github.com/raiden-network/light-client/issues/1830
[#1832]: https://github.com/raiden-network/light-client/pull/1832
[#1835]: https://github.com/raiden-network/light-client/pull/1835
[#1848]: https://github.com/raiden-network/light-client/issues/1848
[#1882]: https://github.com/raiden-network/light-client/issues/1882

## [0.9.0] - 2020-05-28
### Added
- [#1473] Expose config$ observable

[#1473]: https://github.com/raiden-network/light-client/issues/1473

### Changed
- [#842] Don't enforce test nets.

[#842]: https://github.com/raiden-network/light-client/issues/842

## [0.8.0] - 2020-05-14
### Added
- [#1369] Monitoring based on channel's balance

[#1369]: https://github.com/raiden-network/light-client/issues/1369

### Changed
- [#1480] Update profile's caps on config.caps change and react on peers updates
- [#1503] Expose received transfers through transfers$ observable

[#1480]: https://github.com/raiden-network/light-client/pull/1480
[#1503]: https://github.com/raiden-network/light-client/issues/1503

## [0.7.0] - 2020-05-08
### Added
- [#1392] Raiden on-chain methods provide easy ways to transfer entire token & ETH balances
- [#1368] Monitoring transfers (experimental)
- [#1252] Mediate transfers (experimental)

[#1392]: https://github.com/raiden-network/light-client/issues/1392
[#1368]: https://github.com/raiden-network/light-client/issues/1368
[#1252]: https://github.com/raiden-network/light-client/issues/1252

### Fixed
- [#1456] Retry without stored setup if auth fails
- [#1434] Ensure past channel events are correctly fetched

[#1456]: https://github.com/raiden-network/light-client/issues/1456
[#1434]: https://github.com/raiden-network/light-client/issues/1434

### Changed
- [#1462] Refactor state schema and types to be simpler and safer

[#1462]: https://github.com/raiden-network/light-client/issues/1462

## [0.6.0] - 2020-04-21
### Added
- [#1338] Allow HTTP URLs for Path Finding Service (non-production)
- [#1261] Implements fast WebRTC P2P transport (experimental)
- [#1211] Integration test for mediated transfers

[#1338]: https://github.com/raiden-network/light-client/issues/1338
[#1261]: https://github.com/raiden-network/light-client/issues/1261
[#1211]: https://github.com/raiden-network/light-client/issues/1211

## [0.5.2] - 2020-04-07
### Fixed
- [#1254] Downgraded contract version 0.36.2

[#1254]: https://github.com/raiden-network/light-client/issues/1254

## [0.5.1] - 2020-04-06
### Added
- [#1209] Support for receiving payments
- [#1254] Bumped contract version to 0.37.0-beta

[#1209]: https://github.com/raiden-network/light-client/issues/1209
[#1254]: https://github.com/raiden-network/light-client/issues/1254

## [0.5.0] - 2020-03-27
### Added
- [#348] Foundation for integration tests w/ Raiden Python client.
- [#774] Reduced size of transpiled bundle.
- [#1209] Added transport capabilities.
- Upgraded `matrix-js-sdk` dependency.

[#348]: https://github.com/raiden-network/light-client/issues/348
[#774]: https://github.com/raiden-network/light-client/issues/744
[#1209]: https://github.com/raiden-network/light-client/issues/1209

### Fixed
- [#1232] Fixed logging.

[#1232]: https://github.com/raiden-network/light-client/issues/1232

## [0.4.2] - 2020-03-05
### Added
- [#1135] Add logging to mint & depositToUDC public methods
- [#152] Enable download of local data (state)

[#152]: https://github.com/raiden-network/light-client/issues/152

### Fixed
- [#1133] Fix minor bug when minting & depositing to UDC for the first time

## [0.4.1] - 2020-03-04
### Changed
- [#1128] Enable faster channel opening & deposit by parallelizing them and their confirmations

### Fixed
- [#1120] Ensure PFS is updated by sending a PFSCapacityUpdate every time our capacity changes
- [#1116] Wait for confirmation blocks after mint & depositToUDC to resolve promise

[#1120]: https://github.com/raiden-network/light-client/issues/1120
[#1128]: https://github.com/raiden-network/light-client/issues/1128
[#1116]: https://github.com/raiden-network/light-client/issues/1116

## [0.4.0] - 2020-02-28
### Added
- [#614] Implement state upgrades and migration
- [#613] Implement waiting for confirmation blocks on on-chain transactions (configurable)
- [#1000] Implemented SDK error handling

### Changed
- [#986] Don't expire locks which secret got registered on-chain
- [#926] Introduce loglevel logging framework (config.logger now specifies logging level)
- [#1042] Support decoding addresses on messages on lowercased format

[#1000]: https://github.com/raiden-network/light-client/issues/1000

## [0.3.0] - 2020-02-07
### Added
- [#172] Add derived subkey support

### Changed
- [#834] Optimize ethers events polling for several tokens
- [#684] Support and require Typescript 3.7
- [#593] Improve PFS url matching.
- Updated Raiden Contracts to 0.36.0

## [0.2] - 2019-11-29
### Added
- Add withdraw request support.
- Add chainId and registry address to the state.
- Add SDK configuration.
- Add PFS find routes functionality.
- Add PFS Capacity Update.
- Add configuration for global rooms & PFS rooms.
- Add PFS safety margin.
- Add ServiceRegistry monitoring.
- Add find PFS functionality.
- Add token minting for testnets
- Add IOU fetching and signing.
- Add UserDeposit capacity retrieving function to the public API.
- Add UserDeposit token address to the public API.
- Add UserDeposit deposit function to the public API.
- Add direct route checking function to the public API.

### Changed
- Update raiden contracts to support Alderaan.
- Update message packing and signature to confront with Alderaan format.
- Optimize past event scanning.
- Make transfer parameters consistent with openChannel.
- Update previous transfer initialization to monitor pending transfers.
- Update the transfer mechanism to accept transfers that are reduced up to 10% due to fees.
- Increase time before leaving unknown rooms.
- Reduce the minimum settle timeout to 20.
- Remove fee field from LockedTransfer to comply with raiden-py.
- Improve matrix transport invite, join algorithm.
- BigNumbers are decoded/encoded as string.

### Fixed
- Fix matrix error handling on user presence.
- Fix matrix re-authentication on config change.
- Fix WithdrawExpired to comply with raiden-py.
- Fix lossless state loading.
- Fix scheduling issues with matrix epics.
- Fix lossless parsing of PFS information.
- Fix past log ordering.
- Fix logging disable not working properly.

### Removed
- Remove Kovan network support.
- Remove requirement for monitored token when calling getTokenInfo|getTokenBalance.

## [0.1.1] - 2019-10-07
### Added
- Add RaidenChannels alias.
- Add monitoring for transfers based on secret hash.

### Changed
- Change transfer api return secret hash.

## [0.1] - 2019-08-21
### Added
- Add token monitoring.
- Add channel lifecycle integration (open/close/settle) with contracts.
- Add channel deposit functionality.
- Add channels$ to the public API.
- Add getTokenBalance and getTokenInfo to public API.
- Add network and events$ to the public API.
- Add account change and network change monitoring.
- Add matrix sdk/transport integration.
- Add protocol message implementation.


[Unreleased]: https://github.com/raiden-network/light-client/compare/v0.11.0...HEAD
[0.11.0]: https://github.com/raiden-network/light-client/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/raiden-network/light-client/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/raiden-network/light-client/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/raiden-network/light-client/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/raiden-network/light-client/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/raiden-network/light-client/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/raiden-network/light-client/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/raiden-network/light-client/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/raiden-network/light-client/compare/v0.4.2...v0.5.0
[0.4.2]: https://github.com/raiden-network/light-client/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/raiden-network/light-client/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/raiden-network/light-client/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/raiden-network/light-client/compare/v0.2...v0.3.0
[0.2]: https://github.com/raiden-network/light-client/compare/v0.1.1...v0.2
[0.1.1]: https://github.com/raiden-network/light-client/compare/v0.1...v0.1.1
[0.1]: https://github.com/raiden-network/light-client/releases/tag/v0.1
