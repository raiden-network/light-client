import { navigateToDisclaimerRoute } from '../utils';

it('accepts disclaimer and redirects to home route', () => {
  navigateToDisclaimerRoute();
  cy.contains('Disclaimer').should((div) => expect(div).toBeVisible());

  cy.get('.disclaimer__accept-checkbox').click();
  cy.get('.disclaimer__persist-checkbox').click();
  cy.get('.disclaimer__accept-button').click();

  cy.url().should((url) => expect(url).toContain('/#/home'));
});
