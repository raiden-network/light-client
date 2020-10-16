export function mintAndDepositUtilityTokenFromSelectHubScreen() {
  cy.get('.select-hub').should('exist');
  cy.get('.udc-balance__deposit').click();
  cy.getWithCustomTimeout('.udc-deposit-dialog__action').should('exist');
  cy.get('.udc-deposit-dialog__action').click();
  cy.getWithCustomTimeout('.udc-deposit-dialog__action').should('not.exist');
}

export function mintConnectedTokenFromSelectHubScreen() {
  cy.get('.select-hub').should('exist');
  cy.get('.token-information__mint').click();
  cy.getWithCustomTimeout('.mint-dialog__button').should('exist');
  cy.get('.mint-dialog__button').click();
  cy.getWithCustomTimeout('.mint-dialog__button').should('not.exist');
}

export function openChannel() {
  cy.get('.open-channel').should('exist');
  cy.get('.open-channel__button').click();
  cy.getWithCustomTimeout('.open-channel-dialog').should('not.exist');
  cy.getWithCustomTimeout('.open-channel').should('not.exist');
}

export function depositTokensToOpenedChannel() {
  cy.get('.channel-deposit').should('exist');
  cy.get('.channel-deposit__button').click();
  cy.getWithCustomTimeout('.channel-deposit').should('not.exist');
}

export function withdrawTokens() {
  cy.get('.channel-withdraw').should('exist');
  cy.get('.channel-withdraw__button').click();
  cy.getWithCustomTimeout('.channel-withdraw').should('not.exist');
}

export function transferETHToRaidenAccount() {
  cy.get('.raiden-account__transfer-button__button').click();
  cy.getWithCustomTimeout('.raiden-account__progress-wrapper').should(
    'not.exist'
  );
}

export function withdrawTokensBackToMainAccount() {
  cy.get('.withdrawal__tokens').should('exist');
  cy.get('.withdrawal__tokens__button').eq(0).click();
  cy.getWithCustomTimeout('.withdrawal-dialog__action').should('exist');
  cy.get('.withdrawal-dialog__action').click();
  cy.getWithCustomTimeout('.withdrawal__empty').should('exist');
}

export function withdrawUDCTokens() {
  cy.get('.udc-withdrawal-dialog').should('exist');
  cy.get('.udc-withdrawal-dialog__button').click();
  cy.getWithCustomTimeout('.udc-withdrawal-dialog').should('not.exist');
}
