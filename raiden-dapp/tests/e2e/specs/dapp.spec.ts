// https://docs.cypress.io/api/introduction/api.html

describe('connects', () => {
  it('connects to the dApp', () => {
    cy.viewport('macbook-13');
    cy.visit('/');
    cy.contains('Welcome to the Raiden dApp').should('be.visible');
    cy.contains('Connect').click();
    cy.contains('Generate Account & Key').should('be.visible');
    cy.contains('Generate Account & Key').click();

    cy.contains('Receiving transfers is disabled').should('be.visible');
    cy.get('.raiden-dialog__close').click();
    cy.contains('Connect new token').should('be.visible');
  });
});
