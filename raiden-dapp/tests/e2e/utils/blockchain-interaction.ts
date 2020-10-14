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
