# Changelog

## [Unreleased]

## [2.1.0] - 2021-12-29

## [2.0.1] - 2021-12-24

## [2.0.0] - 2021-12-23
### Added
- [#2949] Passthrough `/payments` parameters, including `paths`, which should receive pre-fetched route in the format `{ route: Address[]; estimated_fee: NumericString; address_metadata?: MetadataMap }[]`.
- [#2971] Allow appending `:<block>` to `--user-deposit-contract-address=` option, to start scanning since this block instead of genesis

[#2949]: https://github.com/raiden-network/light-client/issues/2949
[#2971]: https://github.com/raiden-network/light-client/pull/2971

## [2.0.0-rc.2] - 2021-09-14

## [2.0.0-rc.1] - 2021-08-13

## [1.1.0] - 2021-08-09

## [1.0.0] - 2021-06-16

## [0.17.0] - 2021-06-15
### Added
- [#2789] Make raiden-cli package being published to NPM registry on new relases

[#1576]: https://github.com/raiden-network/light-client/issues/2789


### Added
- [#1576] Add functionality to deploy token networks
- [#2577] Add `--proportional-imbalance-fee` and `--cap-mediation-fees` options for imbalance fees
- [#2795] Add `--gas-price` option to control gasPrice strategy as a multiplier of provider-returned `eth_gasPrice`
- [#2590] Add default configuration for mediation fees

[#1576]: https://github.com/raiden-network/light-client/issues/1576
[#2577]: https://github.com/raiden-network/light-client/issues/2577
[#2795]: https://github.com/raiden-network/light-client/issues/2795
[#2790]: https://github.com/raiden-network/light-client/issues/2790

## [0.16.0] - 2021-04-01
### Changed
- [#2570] Support list of additional services URLs to be passed to `--pathfindingServiceAddress`
- [#2581] CLI now defaults to `3% * fee + 0.05% * amount` for fee safety margin, same as PC

### Added
- [#1342] `--flat-fee` param to set a fixed fee (per token) to be taken on transfers being mediated

[#1342]: https://github.com/raiden-network/light-client/issues/1342
[#2581]: https://github.com/raiden-network/light-client/pull/2581

## [0.15.0] - 2021-01-26
### Added
- [#2417] Register sensible endpoints on 'synced' SDK promise, updates /status API accordingly

### Changed
- [#2505] Wait for background tasks to gracefully complete before exiting

[#2417]: https://github.com/raiden-network/light-client/pull/2417
[#2505]: https://github.com/raiden-network/light-client/pull/2505

## [0.14.0] - 2020-11-25
### Fixed
- [#2361] Workaround wrtc segfault on teardown

[#2361]: https://github.com/raiden-network/light-client/issues/2361

## [0.13.0] - 2020-11-10
### Fixed
- [#2314] Return proper error codes for transfer failures
- [#2344] Handle JSON wallets with trimmed IVs

[#2314]: https://github.com/raiden-network/light-client/pull/2336
[#2344]: https://github.com/raiden-network/light-client/issues/2336

## [0.12.0] - 2020-10-22
### Changed

- [#2053] Remove obsolete entrypoint and make `raiden` the default one
- [#2172] Bundle CLI with `ncc`

[#2053]: https://github.com/raiden-network/light-client/pulls/2053
[#2172]: https://github.com/raiden-network/light-client/issues/2172

## [0.11.1] - 2020-08-18
### Changed

- [#2054] Update to Raiden contracts `v0.37.1`

[#2054]: https://github.com/raiden-network/light-client/pulls/2054


[Unreleased]: https://github.com/raiden-network/light-client/compare/v2.1.0...HEAD
[2.1.0]: https://github.com/raiden-network/light-client/compare/v2.0.1...v2.1.0
[2.0.1]: https://github.com/raiden-network/light-client/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/raiden-network/light-client/compare/v2.0.0-rc.2...v2.0.0
[2.0.0-rc.2]: https://github.com/raiden-network/light-client/compare/v2.0.0-rc.1...v2.0.0-rc.2
[2.0.0-rc.1]: https://github.com/raiden-network/light-client/compare/v1.1.0...v2.0.0-rc.1
[1.1.0]: https://github.com/raiden-network/light-client/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/raiden-network/light-client/compare/v0.17.0...v1.0.0
[0.17.0]: https://github.com/raiden-network/light-client/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/raiden-network/light-client/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/raiden-network/light-client/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/raiden-network/light-client/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/raiden-network/light-client/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/raiden-network/light-client/compare/v0.11.1...v0.12.0
[0.11.1]: https://github.com/raiden-network/light-client/compare/v0.11.0...v0.11.1
