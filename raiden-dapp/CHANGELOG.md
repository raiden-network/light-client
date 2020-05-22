# Changelog

## [Unreleased]

### Fixed

- [#1516] Fixed truncation of address on Account screen
- [#1506] Fixed error label display on transfer screen for amount input.
- [#1493] Properly handles tokens with zero decimals, fixes transaction history token display.
- [#1485] Fixed token list sorting.

### Changed

- [#1443] Eth transfer screen redesign
- [#842] Disable mainnet w/ environment variable.

[#1443]: https://github.com/raiden-network/light-client/issues/1443
[#1516]: https://github.com/raiden-network/light-client/issues/1516
[#1506]: https://github.com/raiden-network/light-client/issues/1506
[#1493]: https://github.com/raiden-network/light-client/issues/1493
[#1485]: https://github.com/raiden-network/light-client/issues/1485

## [0.8.0] - 2020-05-14

### Added

- [#1212] Allows user to view history of all transactions that has been made.
- [#1380] Allow the user to withdraw tokens from the Raiden Account.
- [#1371] Mint and deposit utility token to pay Monitoring Service.
- [#1302] Raiden Account as default account.

### Fixed

- [#1490] Fixes scrollbar always showing up in channels screen.

[#1490]: https://github.com/raiden-network/light-client/issues/1490
[#1212]: https://github.com/raiden-network/light-client/issues/1212
[#1380]: https://github.com/raiden-network/light-client/issues/1380
[#1371]: https://github.com/raiden-network/light-client/issues/1371
[#1302]: https://github.com/raiden-network/light-client/issues/1302

## [0.7.0] - 2020-05-08

### Added

- [#1365] Allow user to transfer ETH between Main and Raiden account.
- [#1424] Sort tokens in token list by balance and symbol.

### Fixed

- [#1402] Aligning token symbol on input fields
- [#1413] Token select overlay closes as soon as a new token is selected.
- [#1395] Fixes navigation issues due to early redirect.
- [#1381] Summary screen display exact amounts on hover
- [#1300] General screen shows Raiden account balance when using subkey.
- [#1382] Better error handling when PFS can't find routes between nodes.
- [#1427] Scroll bar issue in Channel List view.

### Changed

- [#1458] General screen has been renamed to account.

[#1458]: https://github.com/raiden-network/light-client/issues/1458
[#1402]: https://github.com/raiden-network/light-client/issues/1402
[#1413]: https://github.com/raiden-network/light-client/issues/1413
[#1395]: https://github.com/raiden-network/light-client/issues/1395
[#1381]: https://github.com/raiden-network/light-client/issues/1381
[#1300]: https://github.com/raiden-network/light-client/issues/1300
[#1382]: https://github.com/raiden-network/light-client/issues/1382
[#1365]: https://github.com/raiden-network/light-client/issues/1365
[#1424]: https://github.com/raiden-network/light-client/issues/1424
[#1427]: https://github.com/raiden-network/light-client/issues/1427

## [0.6.0] - 2020-04-21

### Added

- [#1222] Enables state upload

### Fixed

- [#1305] Redirects to home view upon shutdown
- [#1306] Redirects to home view upon page refresh
- [#1310] Disable state download if not connected to web3 provider.

[#1305]: https://github.com/raiden-network/light-client/issues/1305
[#1306]: https://github.com/raiden-network/light-client/issues/1306
[#1222]: https://github.com/raiden-network/light-client/issues/1222
[#1310]: https://github.com/raiden-network/light-client/issues/1310

## [0.5.2] - 2020-04-07

- No changes

## [0.5.1] - 2020-04-06

### Added

- [#694] Show protocol progress steps on transfer modal.
- [#687] Ghost action buttons.

### Fixed

- [#1243] Fix width of transfer input on mobile screens.
- [#1242] Fix transfer modal not closing instantly.

[#694]: https://github.com/raiden-network/light-client/issues/694
[#694]: https://github.com/raiden-network/light-client/issues/694
[#1243]: https://github.com/raiden-network/light-client/issues/1243
[#1242]: https://github.com/raiden-network/light-client/issues/1242
[#687]: https://github.com/raiden-network/light-client/issues/687

## [0.5.0] - 2020-03-27

### Added

- [#691] Auto-suggesting hub on Goerli.
- [#921] Transfer identifier on summary screen.
- [#1136] Ability to scan QR codes.
- [#1160] Ability to submit forms via enter.
- [#300] Enter amounts with leading "." (dot).
- [#1222] dApp window as home screen

[#691]: https://github.com/raiden-network/light-client/issues/691
[#921]: https://github.com/raiden-network/light-client/issues/921
[#1136]: https://github.com/raiden-network/light-client/issues/1136
[#1160]: https://github.com/raiden-network/light-client/issues/1160
[#300]: https://github.com/raiden-network/light-client/issues/300
[#1222]: https://github.com/raiden-network/light-client/issues/1222

## [0.4.2] - 2020-03-05

### Fixed

- [#1139] Fix AddressInput value resetting when validation fails

[#1139]: https://github.com/raiden-network/light-client/issues/1139

## [0.4.1] - 2020-03-04

### Fixed

- [#1116] Fixed unhandled exception on transfer error dialog on PFS expected errors
- [#1118] Fixed token list in token overlay.
- [#1115] Fixed error message when trying to connect to main net.
- [#1078] Various mobile UI improvements.

[#1078]: https://github.com/raiden-network/light-client/issues/1078
[#1118]: https://github.com/raiden-network/light-client/issues/1118
[#1115]: https://github.com/raiden-network/light-client/issues/1115
[#1116]: https://github.com/raiden-network/light-client/issues/1116

## [0.4.0] - 2020-02-28

### Added

- [#745] Possibility to connect LC with derived subkey
- [#1015] More prominent warning for low UDC token balance
- [#695] Skipping of transfer steps.
- [#1071] Mint token feature.
- [#1112] Implement log storage across sessions

### Changed

- [#693] Localized error messages for Pathfinding errors.

### Fixed

- [#1065] Prevent select hub dialog from being accidentally dismissed.
- [#1067] Fixed displayed service fee on summary screen.
- [#1066] Fixed continue button enabled w/o selected PFS.

[#1112]: https://github.com/raiden-network/light-client/issues/1112
[#1066]: https://github.com/raiden-network/light-client/issues/1066
[#745]: https://github.com/raiden-network/light-client/issues/745
[#1065]: https://github.com/raiden-network/light-client/issues/1065
[#1067]: https://github.com/raiden-network/light-client/issues/1067
[#1071]: https://github.com/raiden-network/light-client/issues/1071
[#1015]: https://github.com/raiden-network/light-client/issues/1015
[#695]: https://github.com/raiden-network/light-client/issues/695
[#693]: https://github.com/raiden-network/light-client/issues/693

## [0.3.0] - 2020-02-07

### Added

- [#218] Matrix availability check to address inputs.
- [#585] Pending transfer badge icon
- [#930] Display complete address on hover
- [#543] Added transfer summary

### Changed

- User can now dismiss/hide the transfer progress dialog.
- Fix utility token display on PFS route selection.
- Adjust the token fetching to work with the latest SDK changes.
- Stepper replaced with the new modal when opening a channel

### Fixed

- [#712] Fix AddressInput.vue validity not updating on presence changes.
- [#704] Amount and address input styles.
- [#740] Fix empty start screen on first time connect.
- [#642] Various UI improvements.
- [#715] Fixed action button disabled color.
- [#885] Fixed AddressInput validation not working properly.

[#885]: https://github.com/raiden-network/light-client/issues/885
[#740]: https://github.com/raiden-network/light-client/issues/740
[#712]: https://github.com/raiden-network/light-client/issues/712
[#704]: https://github.com/raiden-network/light-client/issues/704
[#218]: https://github.com/raiden-network/light-client/issues/218
[#585]: https://github.com/raiden-network/light-client/issues/585
[#642]: https://github.com/raiden-network/light-client/issues/642
[#715]: https://github.com/raiden-network/light-client/issues/715
[#930]: https://github.com/raiden-network/light-client/issues/930
[#543]: https://github.com/raiden-network/light-client/issues/543

## [0.2] - 2019-11-29

### Added

- Add PFS route selection functionality.
- Add PFS service selection functionality.
- Add hint that additional messages may pop up and require signing.
- Add flow for selecting PathFinding Service and route.
- Add mint and deposit functionality for PathFinding service flow.
- Add new Home screen.
- Add offline detection and notification.
- Add update notification when there is a new version deployed.

### Changed

- Optimize token loading.
- Add query parameters to routes.
- Implement new token Transfer screen.
- Change wording on user interface from 'Payment' to 'Transfer'.
- Button style in a some screens.
- Minor layout changes to be consistent with the designs.
- Change token amount display across the dApp.

### Fixed

- Fix Address and Amount input validation.
- Fix performance issues when changing network.
- Fix lose of query parameters when redirecting to SPA.
- Fix account address copy button tooltip.
- Fix address input invalidation when resolving an ens address.
- Fix typo in then dialog when closing a closing.
- Fix stepper background color.
- Fix scrollbar color and theme on Firefox and Webkit based browsers.
- Fix UI implementation/design inconsistencies.

### Removed

- Remove back button from transfer screen.
- Remove connected token screen.

## [0.1.1] - 2019-10-07

### Added

- Add route guards.

### Changed

- Simplifies transfer screen.
- Change transfer to proper monitor transfer state.

### Fixed

- Fix channel stepper view.
- Fix address input error message cutoff and alignment.
- Fix deposit modal (on transfer screen) closing after a successful deposit.
- Fix transfer/deposit erroneously allowing the user to deposit/transfer when no open channel exists.

## [0.1] - 2019-08-21

### Added

- Add a basic dApp layout.
- Add an error screen when no provider is detected.
- Add integration with the channel lifecycle (open/close/settle).
- Add channel deposit screen.
- Add channel monitoring.
- Add checksum address validation to address input.
- Add basic loading screen.
- Add token list screen.
- Add channel list screen.
- Add noscript error message.
- Add network information on the header.
- Add disclaimer to the footer of the dApp.
- Add link to privacy policy.
- Add basic transfer screen.

[unreleased]: https://github.com/raiden-network/light-client/compare/v0.8.0...HEAD
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
