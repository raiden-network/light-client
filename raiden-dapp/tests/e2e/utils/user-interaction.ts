export function acceptDisclaimer() {
  cy.get('.disclaimer').should('exist');
  cy.get('.disclaimer__accept-checkbox').click();
  cy.get('.disclaimer__persist-checkbox').click();
  cy.get('.disclaimer__accept-button').click();
  cy.getWithCustomTimeout('.disclaimer').should('not.exist');
}

export function connectToDapp(firstTimeConnect = true) {
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
