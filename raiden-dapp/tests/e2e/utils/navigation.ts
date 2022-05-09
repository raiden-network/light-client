/**
 *
 */
export function navigateToDisclaimer() {
  cy.log('navigate to disclaimer');
  cy.visit('/');
  cy.getWithCustomTimeout('.disclaimer').should('exist');
  cy.contains('Disclaimer');
}

/**
 *
 */
export function navigateToSelectHub() {
  cy.log('navigate to select hub');
  // cypress selectors: raiden-dapp/src/components/NoTokens.vue
  cy.getWithCustomTimeout('[data-cy=no-connected-token__connect-button]').should('exist');
  cy.get('[data-cy=no-connected-token__connect-button]').click();
  // cypress selectors: raiden-dapp/src/components/tokens/TokenListItem.vue
  cy.getWithCustomTimeout('[data-cy=token_list_item]').eq(0).should('exist');
  cy.get('[data-cy=token_list_item]').eq(0).click();
  // cypress selectors: raiden-dapp/src/views/SelectHubRoute.vue
  cy.getWithCustomTimeout('[data-cy=select_hub]').should('exist');
  cy.contains('Select Hub');
}

/**
 *
 */
export function navigateToNotificationPanel() {
  cy.log('navigate to notification panel');
  // cypress selectors: raiden-dapp/src/components/AppHeader.vue
  cy.get('[data-cy=app-header_content_icons_notifications-button]').click();
  // cypress selectors: raiden-dapp/src/views/NotificationPanel.vue
  cy.getWithCustomTimeout('[data-cy=notification_panel]').should('exist');
}

/**
 *
 */
export function navigateToAccountMenu() {
  cy.log('navigate to account menu');
  // cypress selectors: raiden-dapp/src/components/AppHeader.vue
  cy.get('[data-cy=app-header_content_icons_identicon]').click();
  // cypress selectors: raiden-dapp/src/views/account/AccountRoot.vue
  cy.getWithCustomTimeout('[data-cy=account_root]').should('exist');
}

/**
 *
 */
export function navigateToBackupState() {
  cy.log('navigate to backup state');
  // cypress selectors: raiden-dapp/src/views/account/AccountRoot.vue
  cy.get('[data-cy=account_root]').should('exist');
  cy.get('[data-cy=account_content_menu_list_items]').eq(3).click();
  // cypress selectors: raiden-dapp/src/views/account/BackupState.vue
  cy.getWithCustomTimeout('[data-cy=backup_state]').should('exist');
}

/**
 *
 */
export function navigateToTokenSelect() {
  navigateBackToAccountMenu();
  navigateBackToTransferScreenFromOverlay();
  cy.log('navigate to token select');
  // cypress selectors: raiden-dapp/src/components/transfer/TransferInputs.vue
  cy.get('[data-cy=transfer_inputs]').should('exist');
  // cypress selectors: raiden-dapp/src/components/transfer/TransferHeaders.vue
  cy.get('[data-cy=transfer_menus_token_select]').click();
}

/**
 *
 */
export function navigateToConnectNewTokenFromTokenOverlay() {
  cy.log('navigate to connect new token from token overlay');
  // cypress selectors: raiden-dapp/src/components/overlays/TokenOverlay.vue
  cy.getWithCustomTimeout('[data-cy=token_overlay_connect_new]').should('exist');
  cy.get('[data-cy=token_overlay_connect_new]').click();
  // cypress selectors: raiden-dapp/src/components/tokens/TokenList.vue
  cy.getWithCustomTimeout('[data-cy=token_list]').should('exist');
  cy.contains('Select Token');
}

/**
 *
 */
export function navigateBackToTransferScreenFromOverlay() {
  cy.log('navigate back to transfer screen from overlay');
  // cypress selectors: raiden-dapp/src/components/AppHeader.vue
  cy.get('[data-cy=header-content_back-button]').click();
  // cypress selectors: raiden-dapp/src/components/transfer/TransferInputs.vue
  cy.getWithCustomTimeout('[data-cy=transfer_inputs]').should('exist');
}

/**
 *
 */
export function navigateToTokenDepositFromTransferScreen() {
  cy.log('navigate to token deposit from transfer screen');
  // cypress selectors: raiden-dapp/src/components/transfer/TransferInputs.vue
  cy.get('[data-cy=transfer_inputs]').should('exist');
  // cypress selectors: raiden-dapp/src/components/transfer/TransferHeaders.vue
  cy.get('[data-cy=transfer_menus_dot_menu_button]').click();
  cy.getWithCustomTimeout('[data-cy=transfer_menus_dot_menu_menu_deposit]').should('exist');
  cy.get('[data-cy=transfer_menus_dot_menu_menu_deposit]').click();
  // cypress selectors: raiden-dapp/src/components/dialogs/ChannelDepositDialog.vue
  cy.getWithCustomTimeout('[data-cy=channel-deposit-dialog]').should('exist');
}

/**
 *
 */
export function navigateToChannelsList() {
  cy.log('navigate to channel list');
  // cypress selectors: raiden-dapp/src/components/transfer/TransferInputs.vue
  cy.get('[data-cy=transfer_inputs]').should('exist');
  // cypress selectors: raiden-dapp/src/components/transfer/TransferHeaders.vue
  cy.get('[data-cy=transfer_menus_dot_menu_button]').click();
  cy.getWithCustomTimeout('[data-cy=transfer_menus_dot_menu_menu_channels]').should('exist');
  cy.get('[data-cy=transfer_menus_dot_menu_menu_channels]').click();
  // cypress selectors: raiden-dapp/src/components/channels/ChannelList.vue
  cy.getWithCustomTimeout('[data-cy=channel_list]').should('exist');
}

/**
 *
 */
export function navigateToRaidenAccount() {
  cy.log('navigate to raiden account');
  // cypress selectors: raiden-dapp/src/views/account/AccountRoot.vue
  cy.get('[data-cy=account_root]').should('exist');
  // cypress selectors: raiden-dapp/src/components/account/AccountContent.vue
  cy.get('[data-cy=account_content_menu_list_items]').eq(0).click();
  // cypress selectors: raiden-dapp/src/views/account/RaidenAccount.vue
  cy.getWithCustomTimeout('[data-cy=raiden_account]').should('exist');
}

/**
 *
 */
export function navigateBackToAccountMenu() {
  cy.log('navigate back to account menu');
  // cypress selectors: raiden-dapp/src/views/AccountRoute.vue
  cy.get('[data-cy=header-content_back-button]').first().click();
  // cypress selectors: raiden-dapp/src/views/account/AccountRoot.vue
  cy.getWithCustomTimeout('[data-cy=account_root]').should('exist');
}

/**
 *
 */
export function navigateToWithdrawal() {
  cy.log('navigate to withdrawal');
  // cypress selectors: raiden-dapp/src/views/account/AccountRoot.vue
  cy.get('[data-cy=account_root]').should('exist');
  // cypress selectors: raiden-dapp/src/components/account/AccountContent.vue
  cy.get('[data-cy=account_content_menu_list_items]').eq(1).click();
  // cypress selectors: raiden-dapp/src/components/account/Withdrawal.vue
  cy.getWithCustomTimeout('[data-cy=withdrawal_tokens]').should('exist');
}

/**
 *
 */
export function navigateToUDC() {
  cy.log('navigate to UDC');
  // cypress selectors: raiden-dapp/src/views/account/AccountRoot.vue
  cy.get('[data-cy=account_root]').should('exist');
  // cypress selectors: raiden-dapp/src/components/account/AccountContent.vue
  cy.get('[data-cy=account_content_menu_list_items]').eq(2).click();
  // cypress selectors: raiden-dapp/src/views/account/UDC.vue
  cy.getWithCustomTimeout('[data-cy=udc]').should('exist');
}

/**
 *
 */
export function navigateToDownloadLogs() {
  cy.log('navigate to download logs');
  // cypress selectors: raiden-dapp/src/views/account/AccountRoot.vue
  cy.get('[data-cy=account_root]').should('exist');
  // cypress selectors: raiden-dapp/src/components/account/AccountContent.vue
  cy.get('[data-cy=account_content_menu_list_items]').eq(2).click();
}

/**
 *
 */
export function reloadWholeApplication() {
  cy.log('reload whole application');
  cy.reload(true);
  // Ensure page was actually correctly reloaded with accepted disclaimer in
  // offline mode.
  cy.get('[data-cy=home]').should('exist');
}
