# Changelog

## [Unreleased]
### Changed
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


[Unreleased]: https://github.com/raiden-network/light-client/compare/v0.15.0...HEAD
[0.15.0]: https://github.com/raiden-network/light-client/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/raiden-network/light-client/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/raiden-network/light-client/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/raiden-network/light-client/compare/v0.11.1...v0.12.0
[0.11.1]: https://github.com/raiden-network/light-client/compare/v0.11.0...v0.11.1
