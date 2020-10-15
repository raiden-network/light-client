export function acceptDisclaimer() {
  cy.get('.disclaimer').should('exist');
  cy.get('.disclaimer__accept-checkbox').click();
  cy.get('.disclaimer__persist-checkbox').click();
  cy.get('.disclaimer__accept-button').click();
  cy.getWithCustomTimeout('.disclaimer').should('not.exist');
}

export function connectToDApp(firstTimeConnect = true) {
  cy.get('.home').should('exist');
  cy.get('.home__connect-button').click();

  if (firstTimeConnect) {
    cy.getWithCustomTimeout('.connect__button').should('exist');
    cy.get('.connect__button').click();
  }

  cy.getWithCustomTimeout('.home').should('not.exist');
}

export function enterAndSelectHub(uiTimeout, partnerAddress) {
  cy.get('.select-hub').should('exist');
  cy.get('.address-input').type(partnerAddress);
  cy.wait(uiTimeout);
  cy.get('.select-hub__button').click();
  cy.getWithCustomTimeout('.select-hub').should('not.exist');
}

export function enterChannelDepositAmount(uiTimeout) {
  cy.get('.open-channel').should('exist');
  cy.contains('Open Channel');
  cy.get('.amount-input').type('0.5');
  cy.wait(uiTimeout);
}

export function deleteTopNotification() {
  cy.get('#notification-panel').should('exist');
  cy.getWithCustomTimeout('.notification-card__delete-button')
    .eq(0)
    .should('exist');
  cy.get('.notification-card__delete-button').eq(0).click();
  cy.getWithCustomTimeout('.notification-card').should('not.exist');
}

export function closeNotificationPanel() {
  cy.get('.notification-panel-content__close__button').should('exist');
  cy.get('.notification-panel-content__close__button').click();
  cy.getWithCustomTimeout('#notification-panel').should('not.exist');
}

export function enterTransferAddress(uiTimeout, partnerAddress) {
  cy.get('.transfer-inputs').should('exist');
  cy.get('.address-input').type(partnerAddress);
  cy.wait(uiTimeout);
}

export function enterTransferAmount(uiTimeout) {
  cy.get('.transfer-inputs').should('exist');
  cy.get('.amount-input').type('0.0001');
  cy.wait(uiTimeout);
}

export function makeDirectTransfer(uiTimeout) {
  cy.get('.transfer-inputs').should('exist');
  cy.get('.transfer-inputs__form__button').click();
  cy.wait(uiTimeout);
  cy.getWithCustomTimeout('.transfer__button').should('exist');
  cy.get('.transfer__button').click();
  cy.getWithCustomTimeout('.transfer-inputs').should('exist');
}

export function downloadState() {
  cy.get('.backup-state').should('exist');
  cy.get('.backup-state__buttons__download-state').click();
  cy.getWithCustomTimeout('.download-state__button').should('exist');
  cy.get('.download-state__button').click();
  cy.getWithCustomTimeout('.backup-state').should('not.exist');
}

export function enterDepositTokenAmountForOpenedChannel(uiTimeout) {
  cy.get('.channel-deposit').should('exist');
  cy.get('.channel-deposit__input').type('001');
  cy.wait(uiTimeout);
}

export function enterTokenWithdrawalAmoutFromChannelsList(uiTimeout) {
  cy.get('.channel-list').should('exist');
  cy.get('.channel-action-button').eq(1).click();
  cy.getWithCustomTimeout('.channel-withdraw').should('exist');
  cy.get('.channel-withdraw__input').type('001');
  cy.wait(uiTimeout);
}

export function enterETHAmountToTransferFromRaidenAccount(uiTimeout) {
  cy.get('.raiden-account').should('exist');
  cy.get('input').clear();
  cy.get('.raiden-account__amount-input__field').type('100');
  cy.wait(uiTimeout);
}

export function enterUDCWithdrawalAmount(uiTimeout) {
  cy.get('.udc').should('exist');
  cy.get('.udc__actions__button').eq(1).click();
  cy.getWithCustomTimeout('.udc-withdrawal-dialog').should('exist');
  cy.get('.udc-withdrawal-dialog__amount').type('1');
  cy.wait(uiTimeout);
}
