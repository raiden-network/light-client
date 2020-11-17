# Changelog

## [Unreleased]

### Fixed

### Added

- [#1693] Customizable privacy policy
- [#2308] Show status of planned user deposit withdrawals

### Changed

[#1693]: https://github.com/raiden-network/light-client/issues/1693
[#2308]: https://github.com/raiden-network/light-client/issues/2308

## [0.13.0] - 2020-11-10

### Fixed

### Added

- [#2178] Backup state reminder notification
- [#2285] Add custom Cypress attributes to selectors
- [#2274] Add Cypress tests for closing/settling channel

### Changed

- [#2334] Blockchain related notifications handle confirmation status updates

[#2178]: https://github.com/raiden-network/light-client/issues/2178
[#2285]: https://github.com/raiden-network/light-client/issues/2285
[#2274]: https://github.com/raiden-network/light-client/issues/2274
[#2334]: https://github.com/raiden-network/light-client/issues/2334

## [0.12.0] - 2020-10-22

### Fixed

- [#2237] Displays RDN token on Withdrawal screen
- [#2026] Removed delay time on tooltips
- [#2098] Input fields disabled on transfer screen when no channels are open
- [#1838] Fixes Disclaimer mobile layout
- [#2096] Fixes buggy wallet connection procedure
- [#2108] Fixes red underline under amount input fields on production builds
- [#2144] Fixes navigation to transfer screen when token was selected
- [#2159] Fixes routing issues for account and transfer steps
- [#2238] Fixes broken token overlay for too many connected tokens
- [#2224] Show ETH balance of correct account when withdrawing from UDC

### Added

- [#1941] Notification for opening channels
- [#1255] Optional identifier query parameter for transfers

### Changed

- [#1929] Design adjustments to settlement notifications and notification panel

[#2237]: https://github.com/raiden-network/light-client/issues/2237
[#1255]: https://github.com/raiden-network/light-client/issues/1255
[#1941]: https://github.com/raiden-network/light-client/issues/1941
[#2026]: https://github.com/raiden-network/light-client/issues/2026
[#1929]: https://github.com/raiden-network/light-client/issues/1929
[#2098]: https://github.com/raiden-network/light-client/issues/2098
[#1838]: https://github.com/raiden-network/light-client/issues/1838
[#2096]: https://github.com/raiden-network/light-client/issues/1838
[#2108]: https://github.com/raiden-network/light-client/issues/2108
[#2144]: https://github.com/raiden-network/light-client/issues/2144
[#2159]: https://github.com/raiden-network/light-client/issues/2144
[#2138]: https://github.com/raiden-network/light-client/issues/2138
[#2224]: https://github.com/raiden-network/light-client/issues/2223

## [0.11.1] - 2020-08-18

### Fixed

- [#2047] Conversion and token amount display in UDC deposit dialog

### Added

- [#2039] Dialog with redirect button if all channels are settled

### Changed

- [#1951] Update to be compatible with Raiden Python client `v1.1.1`

[#2039]: https://github.com/raiden-network/light-client/issues/2039
[#2047]: https://github.com/raiden-network/light-client/issues/2047
[#1951]: https://github.com/raiden-network/light-client/issues/1951

## [0.11.0] - 2020-08-04

### Fixed

- [#2031] "No open channels" displayed instead of 0 balance on transfer screen

### Added

- [#1786] Introduces snackbar display for notifications
- [#1824] Listen to channel settle events and push notifications for them
- [#2002] Add support to VUE_APP_MATRIX_LIST_URL transpile-time env var
- [#1658] Add a disclaimer that the user needs to accept to get access to the app

### Changed

- [#1925] Transfer screen style alignments
- [#2001] Pending transfers removed from identicon
- [#1770] Updated UDC deposit dialog for mainnet
- [#1931] dApp always uses hash mode on router
- [#1769] Updated UDC deposit dialog for testnet
- [#1768] Updated UDC screen
- [#1265] Reduce logs size by hiding superfluous actions entries
- [#1875] Redact sensitive information (transport's accessToken, transfer's secrets) from logs
- [#2033] Transfer history gets filtered for the selected token

[#2031]: https://github.com/raiden-network/light-client/issues/2031
[#1925]: https://github.com/raiden-network/light-client/issues/1925
[#2001]: https://github.com/raiden-network/light-client/issues/2001
[#1770]: https://github.com/raiden-network/light-client/issues/1770
[#1931]: https://github.com/raiden-network/light-client/issues/1931
[#1769]: https://github.com/raiden-network/light-client/issues/1769
[#1768]: https://github.com/raiden-network/light-client/issues/1768
[#1265]: https://github.com/raiden-network/light-client/issues/1265
[#1786]: https://github.com/raiden-network/light-client/issues/1786
[#1824]: https://github.com/raiden-network/light-client/issues/1824
[#1875]: https://github.com/raiden-network/light-client/issues/1875
[#2002]: https://github.com/raiden-network/light-client/issues/2002
[#1658]: https://github.com/raiden-network/light-client/issues/1658
[#2033]: https://github.com/raiden-network/light-client/issues/2033

## [0.10.0] - 2020-07-13

### Added

- [#1791] Introduces configuration for token network monitoring.
- [#1374] Adds notifications when a monitoring service submits a proof.
- [#1421] Dialog to withdraw from the user deposit.
- [#249] Withdraw from channel functionality
- [#168] Notification panel

### Fixed

- [#1788] Bug where button is displayed and modal not closing on UDC withdrawal
- [#1781] Transparent dialog overlay for Firefox
- [#1783] Minor visual alignments
- [#1579] Removes minting references when detected network is mainnet.
- [#1773] Fix performance issues of progress indicators
- [#1756] Fix non-informative error message on SDK's wrapped errors
- [#1805] Fix unintended automatic stop of Raiden Service by web-browser
- [#1876] Show error message on Channels screen if an exception occurs

### Changed

- [#1460] New transfer screen
- [#1610] Adds alderaan compatibility.
- [#1540] Adds title to channels list to clarify that only channels for the selected token display.

[#1460]: https://github.com/raiden-network/light-client/issues/1460
[#1788]: https://github.com/raiden-network/light-client/issues/1788
[#1791]: https://github.com/raiden-network/light-client/issues/1791
[#1781]: https://github.com/raiden-network/light-client/issues/1781
[#1783]: https://github.com/raiden-network/light-client/issues/1783
[#1756]: https://github.com/raiden-network/light-client/issues/1756
[#1773]: https://github.com/raiden-network/light-client/issues/1773
[#1610]: https://github.com/raiden-network/light-client/issues/1610
[#1540]: https://github.com/raiden-network/light-client/issues/1540
[#1579]: https://github.com/raiden-network/light-client/issues/1579
[#1421]: https://github.com/raiden-network/light-client/issues/1421
[#1374]: https://github.com/raiden-network/light-client/issues/1374
[#249]: https://github.com/raiden-network/light-client/issues/249
[#168]: https://github.com/raiden-network/light-client/issues/168
[#1805]: https://github.com/raiden-network/light-client/issues/1805
[#1876]: https://github.com/raiden-network/light-client/pull/1876

## [0.9.0] - 2020-05-28

### Added

- [#1473] Notify when receiving transfers get disabled (e.g. by low UDC balance)
- [#1489] UDC balance view

### Fixed

- [#1541] Truncates long token names in the transfer screen.
- [#1516] Fixed truncation of address on Account screen
- [#1506] Fixed error label display on transfer screen for amount input.
- [#1493] Properly handles tokens with zero decimals, fixes transaction history token display.
- [#1485] Fixed token list sorting.

### Changed

- [#1443] Eth transfer screen redesign
- [#842] Disable mainnet w/ environment variable.

[#1541]: https://github.com/raiden-network/light-client/issues/1541
[#1443]: https://github.com/raiden-network/light-client/issues/1443
[#1473]: https://github.com/raiden-network/light-client/issues/1473
[#1516]: https://github.com/raiden-network/light-client/issues/1516
[#1506]: https://github.com/raiden-network/light-client/issues/1506
[#1493]: https://github.com/raiden-network/light-client/issues/1493
[#1485]: https://github.com/raiden-network/light-client/issues/1485
[#1489]: https://github.com/raiden-network/light-client/issues/1489

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

[Unreleased]: https://github.com/raiden-network/light-client/compare/v0.13.0...HEAD
[0.13.0]: https://github.com/raiden-network/light-client/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/raiden-network/light-client/compare/v0.11.1...v0.12.0
[0.11.1]: https://github.com/raiden-network/light-client/compare/v0.11.0...v0.11.1
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
