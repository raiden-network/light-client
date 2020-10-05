import { navigateToDisclaimerRoute } from '../utils';

it('accepts disclaimer and redirects to home route', () => {
  navigateToDisclaimerRoute();

  cy.contains('Disclaimer').should('be.visible');
  cy.get('.disclaimer__accept-checkbox').click();
  cy.get('.disclaimer__persist-checkbox').click();
  cy.get('.disclaimer__accept-button').click();

  cy.url().should('include', '/#/home');
});
