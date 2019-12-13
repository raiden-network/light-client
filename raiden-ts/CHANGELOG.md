# Changelog

## [Unreleased]
### Added
- [#172] Add derived subkey support

### Changed
- [#684] Support and require Typescript 3.7
- [#593] Improve PFS url matching.

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


[Unreleased]: https://github.com/raiden-network/light-client/compare/v0.2...HEAD
[0.2]: https://github.com/raiden-network/light-client/compare/v0.1.1...v0.2
[0.1.1]: https://github.com/raiden-network/light-client/compare/v0.1...v0.1.1
[0.1]: https://github.com/raiden-network/light-client/releases/tag/v0.1
