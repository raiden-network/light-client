/**
 *
 */
export function acceptDisclaimer() {
  cy.get('[data-cy=disclaimer]').should('exist');
  // cypress selectors: raiden-dapp/src/views/DisclaimerRoute.vue
  cy.get('[data-cy=disclaimer_accept_checkbox]').click({ force: true });
  cy.get('[data-cy=disclaimer_persist_checkbox]').click({ force: true });
  cy.get('[data-cy=disclaimer_accept_button]').click();
  cy.getWithCustomTimeout('[data-cy=disclaimer]').should('not.exist');
}

/**
 * @param firstTimeConnect - Whether this is first time connecting
 */
export function connectToDApp(firstTimeConnect = true) {
  // cypress selectors: raiden-dapp/src/views/Home.vue
  cy.get('[data-cy=home]').should('exist');
  cy.get('[data-cy=home_connect_button]').click();

  if (firstTimeConnect) {
    // cypress selectors: raiden-dapp/src/components/dialogs/ConnectDialog.vue
    cy.getWithCustomTimeout('[data-cy=connect_button]').should('exist');
    cy.get('[data-cy=connect_button]').click();
  }

  cy.getWithCustomTimeout('[data-cy=home]').should('not.exist');
}

/**
 * @param uiTimeout - Timeout to wait
 * @param partnerAddress - Partner address
 */
export function enterAndSelectHub(uiTimeout: number, partnerAddress: string) {
  // cypress selectors: raiden-dapp/src/views/SelectHubRoute.vue
  cy.get('[data-cy=select_hub]').should('exist');
  // cypress selectors: raiden-dapp/src/components/AddressInput.vue
  cy.get('[data-cy=address_input]').type(partnerAddress);
  cy.wait(uiTimeout);
  // cypress selectors: raiden-dapp/src/views/SelectHubRoute.vue
  cy.get('[data-cy=select_hub_button]').click();
  cy.getWithCustomTimeout('[data-cy=select_hub]').should('not.exist');
}

/**
 * @param uiTimeout - Timeout to wait
 */
export function enterChannelDepositAmount(uiTimeout: number) {
  // cypress selectors: raiden-dapp/src/views/OpenChannelRoute.vue
  cy.get('[data-cy=open_channel]').should('exist');
  cy.contains('Open Channel');
  // cypress selectors: raiden-dapp/src/components/AmountInput.vue
  cy.get('[data-cy=amount_input]').type('0.5');
  cy.wait(uiTimeout);
}

/**
 *
 */
export function deleteTopNotification() {
  // cypress selectors: raiden-dapp/src/views/NotificationPanel.vue
  cy.get('[data-cy=notification_panel]').should('exist');
  // cypress selectors: raiden-dapp/src/components/notification-panel/NotificationCard.vue
  cy.getWithCustomTimeout('[data-cy=notification_card_delete_button]').eq(0).should('exist');
  cy.get('[data-cy=notification_card_delete_button]').eq(0).click();
  // cy.getWithCustomTimeout('[data-cy=notification_card]').should('not.exist');
}

/**
 *
 */
export function closeNotificationPanel() {
  // cypress selectors: raiden-dapp/src/views/NotificationPanel.vue
  cy.get('[data-cy=notification_panel_content_close_button]').should('exist');
  cy.get('[data-cy=notification_panel_content_close_button]').click();
  cy.getWithCustomTimeout('[data-cy=notification_panel]').should('not.exist');
}

/**
 * @param uiTimeout - Timeout to wait
 * @param partnerAddress - Partner address
 */
export function enterTransferAddress(uiTimeout: number, partnerAddress: string) {
  // cypress selectors: raiden-dapp/src/components/transfer/TransferInputs.vue
  cy.get('[data-cy=transfer_inputs]').should('exist');
  // cypress selectors: raiden-dapp/src/components/AddressInput.vue
  cy.get('[data-cy=address_input]').type(partnerAddress);
  cy.wait(uiTimeout);
}

/**
 * @param uiTimeout - Timeout to wait
 */
export function enterTransferAmount(uiTimeout: number) {
  // cypress selectors: raiden-dapp/src/components/transfer/TransferInputs.vue
  cy.get('[data-cy=transfer_inputs]').should('exist');
  // cypress selectors: raiden-dapp/src/components/AmountInput.vue
  cy.get('[data-cy=amount_input]').type('0.0001');
  cy.wait(uiTimeout);
}

/**
 * @param uiTimeout - Timeout
 */
export function makeDirectTransfer(uiTimeout: number) {
  // cypress selectors: raiden-dapp/src/components/transfer/TransferInputs.vue
  cy.get('[data-cy=transfer_inputs]').should('exist');
  cy.get('[data-cy=transfer_inputs_form_button]').click();
  cy.wait(uiTimeout);
  // cypress selectors: raiden-dapp/src/views/TransferStepsRoute.vue
  cy.getWithCustomTimeout('[data-cy=transfer_button]').should('exist');
  cy.get('[data-cy=transfer_button]').click();
  cy.getWithCustomTimeout('[data-cy=transfer_inputs]').should('exist');
}

/**
 * @param uiTimeout - Timeout
 */
export function makeMediatedTransfer(uiTimeout: number) {
  // cypress selectors: raiden-dapp/src/components/transfer/TransferInputs.vue
  cy.get('[data-cy=transfer_inputs]').should('exist');
  cy.get('[data-cy=transfer_inputs_form_button]').click();
  cy.wait(uiTimeout);
  // cypress selectors: raiden-dapp/src/views/TransferStepsRoute.vue
  cy.getWithCustomTimeout('[data-cy=transfer_button]').should('exist');
  cy.get('[data-cy=transfer_button]').click();
  // Click again to confirm fees dialog
  cy.getWithCustomTimeout('[data-cy=transfer_button]').should('exist');
  cy.get('[data-cy=transfer_button]').click();
  cy.getWithCustomTimeout('[data-cy=transfer_inputs]').should('exist');
}

/**
 *
 */
export function downloadState() {
  // cypress selectors: raiden-dapp/src/views/account/BackupState.vue
  cy.get('[data-cy=backup_state]').should('exist');
  cy.get('[data-cy=backup_state_buttons_download_state]').click();
  // cypress selectors: raiden-dapp/src/components/account/backup-state/DownloadStateDialog.vue
  cy.getWithCustomTimeout('[data-cy=download_state_button]').should('exist');
  cy.get('[data-cy=download_state_button]').click();
  cy.getWithCustomTimeout('[data-cy=backup_state]').should('not.exist');
}

/**
 * @param uiTimeout - Timeout
 */
export function enterDepositTokenAmountForOpenedChannel(uiTimeout: number) {
  // cypress selectors: raiden-dapp/src/components/dialogs/ChannelDepositDialog.vue
  cy.get('[data-cy=channel_deposit]').should('exist');
  cy.get('[data-cy=channel_deposit_input]').type('001');
  cy.wait(uiTimeout);
}

/**
 * @param uiTimeout - Timeout
 */
export function enterTokenWithdrawalAmoutFromChannelsList(uiTimeout: number) {
  // cypress selectors: raiden-dapp/src/components/channels/ChannelList.vue
  cy.get('[data-cy=channel_list]').should('exist');
  cy.get('[data-cy=channel_action_button]').eq(1).click();
  // cypress selectors: raiden-dapp/src/components/dialogs/ChannelWithdrawDialog.vue
  cy.getWithCustomTimeout('[data-cy=channel_withdraw]').should('exist');
  cy.get('[data-cy=channel_withdraw_input]').type('001');
  cy.wait(uiTimeout);
}

/**
 * @param uiTimeout - Timeout
 */
export function enterETHAmountToTransferFromRaidenAccount(uiTimeout: number) {
  // cypress selectors: raiden-dapp/src/views/account/RaidenAccount.vue
  cy.get('[data-cy=raiden_account]').should('exist');
  cy.get('input').clear();
  cy.get('[data-cy=raiden_account_amount_input_field]').type('100');
  cy.wait(uiTimeout);
}

/**
 * @param uiTimeout - Timeout
 */
export function enterUDCWithdrawalAmount(uiTimeout: number) {
  // cypress selectors: raiden-dapp/src/views/account/UDC.vue
  cy.get('[data-cy=udc]').should('exist');
  cy.get('[data-cy=udc__actions__button__withdrawal]').click();
  // cypress selectors: raiden-dapp/src/components/dialogs/UdcWithdrawalDialog.vue
  cy.getWithCustomTimeout('[data-cy=udc-withdrawal-dialog]').should('exist');
  cy.get('[data-cy=udc-withdrawal-dialog__amount]').type('1');
  cy.wait(uiTimeout);
}
