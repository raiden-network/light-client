import { disclaimerRoute } from '../fixtures';

it('accepts disclaimer and redirects to home route', () => {
  disclaimerRoute();

  cy.contains('Disclaimer').should('be.visible');
  cy.get('.disclaimer__accept-checkbox').click();
  cy.get('.disclaimer__persist-checkbox').click();
  cy.get('.disclaimer__accept-button').click();

  cy.url().should('include', '/#/home');
});
