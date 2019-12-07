# Changelog

## [Unreleased]
### Changed
- User can now dismiss/hide the transfer progress dialog.
- Fix utility token display on PFS route selection.
- [#218] Added matrix availability check to address input component

### Fixed

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

[Unreleased]: https://github.com/raiden-network/light-client/compare/v0.2...HEAD
[0.2]: https://github.com/raiden-network/light-client/compare/v0.1.1...v0.2
[0.1.1]: https://github.com/raiden-network/light-client/compare/v0.1...v0.1.1
[0.1]: https://github.com/raiden-network/light-client/releases/tag/v0.1
