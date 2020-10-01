export const mintAndDepositUtilityToken = () => {
  cy.get('.udc-balance__deposit').click();
  cy.getWithCustomTimeout('.udc-deposit-dialog__action').should('exist');
  cy.get('.udc-deposit-dialog__action').click();
  cy.getWithCustomTimeout('.udc-deposit-dialog__action').should('not.exist');
};

export const mintSelectedToken = () => {
  cy.get('.token-information__mint').click();
  cy.getWithCustomTimeout('.mint-dialog__button').should('exist');
  cy.get('.mint-dialog__button').click();
  cy.getWithCustomTimeout('.mint-dialog__button').should('not.exist');
};

export const openChannel = () => {
  cy.getWithCustomTimeout('.open-channel__button').should('exist');
  cy.get('.open-channel__button').click();
  cy.getWithCustomTimeout('.open-channel-dialog').should('not.exist');
  cy.getWithCustomTimeout('.open-channel').should('not.exist');
};

export const transferETHToRaidenAccount = () => {
  cy.getWithCustomTimeout('.raiden-account').should('exist');
  cy.getWithCustomTimeout('input').should('exist');
  cy.get('input').clear()
  cy.get('.raiden-account__amount-input__field').type('100');
  cy.wait(2000);
  cy.get('.raiden-account__transfer-button__button').click();
  cy.getWithCustomTimeout('.raiden-account__progress-wrapper').should('not.exist');
  cy.get('.account-route__header__content__back__button').click()
  // cy.getWithCustomTimeout('.raiden-account').should('exist');
}

export const withdrawTokensBackToMainAccount = () => {
  cy.get('.withdrawal-dialog__action').should('exist');
  cy.get('.withdrawal-dialog__action').click();
  cy.getWithCustomTimeout('.withdrawal__empty').should('exist');
  cy.get('.account-route__header__content__back__button').click();
}
