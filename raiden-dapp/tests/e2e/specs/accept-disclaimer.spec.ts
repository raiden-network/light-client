describe('disclaimer', () => {
  it('accepts disclaimer and redirects to home route', () => {
    cy.viewport('macbook-13');
    cy.visit('/');
    cy.contains('Disclaimer').should('be.visible');
    cy.get('.disclaimer__accept-checkbox').click();
    cy.get('.disclaimer__persist-checkbox').click();
    cy.get('.disclaimer__accept-button').click();
    cy.url().should('include', '/#/home');
  });
});
