export function navigateToDisclaimer() {
  cy.visit('/');
  cy.getWithCustomTimeout('.disclaimer').should('exist');
  cy.contains('Disclaimer')
}