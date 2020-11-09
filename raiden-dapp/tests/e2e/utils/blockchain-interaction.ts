/**
 *
 */
export function mintAndDepositUtilityTokenFromSelectHubScreen() {
  // cypress selectors: raiden-dapp/src/views/SelectHubRoute.vue
  cy.get('[data-cy=select_hub]').should('exist');
  cy.get('[data-cy=select_hub_udc_balance_deposit]').click();
  // cypress selectors: raiden-dapp/src/components/dialogs/UdcDepositDialog.vue
  cy.getWithCustomTimeout('[data-cy=udc_deposit_dialog_action]').should('exist');
  cy.get('[data-cy=udc_deposit_dialog_action]').click();
  cy.getWithCustomTimeout('[data-cy=udc_deposit_dialog_action]').should('not.exist');
}

/**
 *
 */
export function mintConnectedTokenFromSelectHubScreen() {
  // cypress selectors: raiden-dapp/src/views/SelectHubRoute.vue
  cy.get('[data-cy=select_hub]').should('exist');
  // cypress selectors: raiden-dapp/src/components/TokenInformation.vue
  cy.get('[data-cy=token_information_mint]').click();
  // cypress selectors: raiden-dapp/src/components/dialogs/MintDialog.vue
  cy.getWithCustomTimeout('[data-cy=mint_dialog_button]').should('exist');
  cy.get('[data-cy=mint_dialog_button]').click();
  cy.getWithCustomTimeout('[data-cy=mint_dialog_button]').should('not.exist');
}

/**
 *
 */
export function openChannel() {
  // cypress selectors: raiden-dapp/src/views/OpenChannelRoute.vue
  cy.get('[data-cy=open_channel]').should('exist');
  cy.get('[data-cy=open_channel_button]').click();
  // cypress selectors: raiden-dapp/src/components/dialogs/OpenChannelDialog.vue
  cy.getWithCustomTimeout('[data-cy=open_channel_dialog]').should('not.exist');
  cy.getWithCustomTimeout('[data-cy=open_channel]').should('not.exist');
}

/**
 *
 */
export function depositTokensToOpenedChannel() {
  // cypress selectors: raiden-dapp/src/components/dialogs/ChannelDepositDialog.vue
  cy.get('[data-cy=channel_deposit]').should('exist');
  cy.get('[data-cy=channel_deposit_button]').click();
  cy.getWithCustomTimeout('[data-cy=channel_deposit]').should('not.exist');
}

/**
 *
 */
export function withdrawTokens() {
  // cypress selectors: raiden-dapp/src/components/dialogs/ChannelWithdrawDialog.vue
  cy.get('[data-cy=channel_withdraw]').should('exist');
  cy.get('[data-cy=channel_withdraw_button]').click();
  cy.getWithCustomTimeout('[data-cy=channel_withdraw]').should('not.exist');
}

/**
 *
 */
export function transferETHToRaidenAccount() {
  // cypress selectors: raiden-dapp/src/views/account/RaidenAccount.vue
  cy.get('[data-cy=raiden_account_transfer_button_button]').click();
  cy.getWithCustomTimeout('[data-cy=raiden_account_progress_wrappers]').should('not.exist');
}

/**
 *
 */
export function withdrawTokensBackToMainAccount() {
  // cypress selectors: raiden-dapp/src/components/account/Withdrawal.vue
  cy.get('[data-cy=withdrawal_tokens]').should('exist');
  cy.get('[data-cy=withdrawal_tokens_button]').eq(0).click();
  cy.getWithCustomTimeout('[data-cy=withdrawal_dialog_action]').should('exist');
  cy.get('[data-cy=withdrawal_dialog_action]').click();
  cy.getWithCustomTimeout('[data-cy=withdrawal_empty]').should('exist');
}

/**
 *
 */
export function withdrawUDCTokens() {
  // cypress selectors: raiden-dapp/src/components/dialogs/UdcWithdrawalDialog.vue
  cy.get('[data-cy=udc_withdrawal_dialog]').should('exist');
  cy.get('[data-cy=udc_withdrawal_dialog_button]').click();
  cy.getWithCustomTimeout('[data-cy=udc_withdrawal_dialog]').should('not.exist');
}

/**
 *
 */
export function closeChannel() {
  // cypress selectors: raiden-dapp/src/components/channels/ChannelList.vue
  cy.get('[data-cy=channel_action]').should('exist');
  cy.contains('Close');
  cy.get('[data-cy=channel_action]').click();
  // cypress selectors: raiden-dapp/src/components/dialogs/RaidenDialog.vue
  cy.getWithCustomTimeout('[data-cy=raiden_dialog]').should('exist');
  cy.contains('Close Channel');
  // cypress selectors: raiden-dapp/src/components/ActionButton.vue
  cy.get('[data-cy=action_button]').should('exist');
  cy.get('[data-cy=action_button]').click();
  // cypress selectors: raiden-dapp/src/components/dialogs/RaidenDialog.vue
  cy.get('[data-cy=raiden_dialog]').should('not.exist');
}

/**
 *
 */
export function settleChannel() {
  // cypress selectors: raiden-dapp/src/components/channels/ChannelList.vue
  cy.getWithCustomTimeout('[data-cy=channel_action]').should('exist').and('contain', 'Settle');
  cy.get('[data-cy=channel_action]').click();
  // cypress selectors: raiden-dapp/src/components/dialogs/RaidenDialog.vue
  cy.getWithCustomTimeout('[data-cy=raiden_dialog]').should('exist');
  cy.contains('Settle Channel');
  // cypress selectors: raiden-dapp/src/components/ActionButton.vue
  cy.get('[data-cy=action_button]').should('exist');
  cy.get('[data-cy=action_button]').click();
  // cypress selectors: raiden-dapp/src/components/dialogs/RaidenDialog.vue
  cy.get('[data-cy=raiden_dialog]').should('not.exist');
}
