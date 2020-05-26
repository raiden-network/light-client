// https://docs.cypress.io/api/introduction/api.html

describe('connects', () => {
  it('connects to the dApp', () => {
    cy.visit('/');
    cy.get('.home__app-welcome').should(
      'include.text',
      'Welcome to the Raiden dApp'
    );
    cy.get('.action-button__button').click();
  });
});
