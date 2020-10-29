export function navigateToDisclaimer() {
  cy.visit('/');
  cy.getWithCustomTimeout('.disclaimer').should('exist');
  cy.contains('Disclaimer');
}

export function navigateToSelectHub() {
  // cypress selectors: raiden-dapp/src/components/NoTokens.vue
  cy.get('[data-cy=no_tokens_add]').should('exist');
  cy.get('[data-cy=no_tokens_add]').click();
  // cypress selectors: raiden-dapp/src/components/tokens/TokenListItem.vue
  cy.getWithCustomTimeout('[data-cy=token_list_item]')
    .eq(0)
    .should('exist');
  cy.get('[data-cy=token_list_item]')
    .eq(0)
    .click();
  // cypress selectors: raiden-dapp/src/views/SelectHubRoute.vue
  cy.getWithCustomTimeout('[data-cy=select_hub]').should('exist');
  cy.contains('Select Hub');
}

export function navigateToNotificationPanel() {
  // cypress selectors: raiden-dapp/src/components/AppHeader.vue
  cy.get('[data-cy=app_header_notifications_button]').click();
  // cypress selectors: raiden-dapp/src/views/NotificationPanel.vue
  cy.getWithCustomTimeout('[data-cy=notification_panel]').should('exist');
}

export function navigateToAccountMenu() {
  // cypress selectors: raiden-dapp/src/components/AppHeader.vue
  cy.get('[data-cy=app_header_icons_identicon]').click();
  // cypress selectors: raiden-dapp/src/views/account/AccountRoot.vue
  cy.getWithCustomTimeout('[data-cy=account_root]').should('exist');
}

export function navigateToBackupState() {
  // cypress selectors: raiden-dapp/src/views/account/AccountRoot.vue
  cy.get('[data-cy=account_root]').should('exist');
  cy.get('[data-cy=account_content_menu_list_items_icon_button]')
    .eq(3)
    .click();
  // cypress selectors: raiden-dapp/src/views/account/BackupState.vue
  cy.getWithCustomTimeout('[data-cy=backup_state]').should('exist');
}

export function navigateToTokenSelect() {
  // cypress selectors: raiden-dapp/src/components/transfer/TransferInputs.vue
  cy.get('[data-cy=transfer_inputs]').should('exist');
  // cypress selectors: raiden-dapp/src/components/transfer/TransferHeaders.vue
  cy.get('[data-cy=transfer_menus_token_select]').click();
}

export function navigateToConnectNewTokenFromTokenOverlay() {
  // cypress selectors: raiden-dapp/src/components/overlays/TokenOverlay.vue
  cy.getWithCustomTimeout('[data-cy=token_overlay_connect_new]').should(
    'exist'
  );
  cy.get('[data-cy=token_overlay_connect_new]').click();
  // cypress selectors: raiden-dapp/src/components/tokens/TokenList.vue
  cy.getWithCustomTimeout('[data-cy=token_list]').should('exist');
  cy.contains('Select Token');
}

export function navigateBackToTransferScreenFromOverlay() {
  // cypress selectors: raiden-dapp/src/components/AppHeader.vue
  cy.get('[data-cy=app_header_back_button]').click();
  // cypress selectors: raiden-dapp/src/components/transfer/TransferInputs.vue
  cy.getWithCustomTimeout('[data-cy=transfer_inputs]').should('exist');
}

export function navigateToTokenDepositFromTransferScreen() {
  // cypress selectors: raiden-dapp/src/components/transfer/TransferInputs.vue
  cy.get('[data-cy=transfer_inputs]').should('exist');
  // cypress selectors: raiden-dapp/src/components/transfer/TransferHeaders.vue
  cy.get('[data-cy=transfer_menus_dot_menu_button]').click();
  cy.getWithCustomTimeout(
    '[data-cy=transfer_menus_dot_menu_menu_deposit]'
  ).should('exist');
  cy.get('[data-cy=transfer_menus_dot_menu_menu_deposit]').click();
  // cypress selectors: raiden-dapp/src/components/dialogs/ChannelDepositDialog.vue
  cy.getWithCustomTimeout('[data-cy=channel_deposit]').should('exist');
}

export function navigateToChannelsList() {
  // cypress selectors: raiden-dapp/src/components/transfer/TransferInputs.vue
  cy.get('[data-cy=transfer_inputs]').should('exist');
  // cypress selectors: raiden-dapp/src/components/transfer/TransferHeaders.vue
  cy.get('[data-cy=transfer_menus_dot_menu_button]').click();
  cy.getWithCustomTimeout(
    '[data-cy=transfer_menus_dot_menu_menu_channels]'
  ).should('exist');
  cy.get('[data-cy=transfer_menus_dot_menu_menu_channels]').click();
  // cypress selectors: raiden-dapp/src/components/channels/ChannelList.vue
  cy.getWithCustomTimeout('[data-cy=channel_list]').should('exist');
}

export function navigateToRaidenAccount() {
  // cypress selectors: raiden-dapp/src/views/account/AccountRoot.vue
  cy.get('[data-cy=account_root]').should('exist');
  // cypress selectors: raiden-dapp/src/components/account/AccountContent.vue
  cy.get('[data-cy=account_content_menu_list_items_icon_button]')
    .eq(0)
    .click();
  // cypress selectors: raiden-dapp/src/views/account/RaidenAccount.vue
  cy.getWithCustomTimeout('[data-cy=raiden_account]').should('exist');
}

export function navigateBackToAccountMenu() {
  // cypress selectors: raiden-dapp/src/views/AccountRoute.vue
  cy.get('[data-cy=account_route_header_content_back_button]').click();
  // cypress selectors: raiden-dapp/src/views/account/AccountRoot.vue
  cy.getWithCustomTimeout('[data-cy=account_root]').should('exist');
}

export function navigateToWithdrawal() {
  // cypress selectors: raiden-dapp/src/views/account/AccountRoot.vue
  cy.get('[data-cy=account_root]').should('exist');
  // cypress selectors: raiden-dapp/src/components/account/AccountContent.vue
  cy.get('[data-cy=account_content_menu_list_items_icon_button]')
    .eq(1)
    .click();
  // cypress selectors: raiden-dapp/src/components/account/Withdrawal.vue
  cy.getWithCustomTimeout('[data-cy=withdrawal_tokens]').should('exist');
}

export function navigateToUDC() {
  // cypress selectors: raiden-dapp/src/views/account/AccountRoot.vue
  cy.get('[data-cy=account_root]').should('exist');
  // cypress selectors: raiden-dapp/src/components/account/AccountContent.vue
  cy.get('[data-cy=account_content_menu_list_items_icon_button]')
    .eq(2)
    .click();
  // cypress selectors: raiden-dapp/src/views/account/UDC.vue
  cy.getWithCustomTimeout('[data-cy=udc]').should('exist');
}

export function navigateToDownloadLogs() {
  // cypress selectors: raiden-dapp/src/views/account/AccountRoot.vue
  cy.get('[data-cy=account_root]').should('exist');
  // cypress selectors: raiden-dapp/src/components/account/AccountContent.vue
  cy.get('[data-cy=account_content_menu_list_items_icon_button]')
    .eq(4)
    .click();
}
