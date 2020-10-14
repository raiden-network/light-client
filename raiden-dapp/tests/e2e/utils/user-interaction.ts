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