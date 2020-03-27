# Changelog

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


[0.4.2]: https://github.com/raiden-network/light-client/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/raiden-network/light-client/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/raiden-network/light-client/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/raiden-network/light-client/compare/v0.2...v0.3.0
[0.2]: https://github.com/raiden-network/light-client/compare/v0.1.1...v0.2
[0.1.1]: https://github.com/raiden-network/light-client/compare/v0.1...v0.1.1
[0.1]: https://github.com/raiden-network/light-client/releases/tag/v0.1
