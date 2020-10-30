import { navigateToDisclaimerRoute } from '../utils';

it('accepts disclaimer and redirects to home route', () => {
  navigateToDisclaimerRoute();
  cy.contains('Disclaimer').should((div) => expect(div).toBeVisible());

  cy.get('[data-cy=disclaimer_accept_checkbox]').click({ force: true });
  cy.get('[data-cy=disclaimer_persist_checkbox]').click({ force: true });
  cy.get('[data-cy=disclaimer_accept_button]').click();
  cy.getWithCustomTimeout('[data-cy=disclaimer]').should('not.exist');
  cy.url().should((url) => expect(url).toContain('/#/home'));
});
