export function navigateToDisclaimer() {
  cy.visit('/');
  cy.getWithCustomTimeout('.disclaimer').should('exist');
  cy.contains('Disclaimer');
}

export function navigateToSelectHub() {
  cy.get('.no-tokens__add').should('exist');
  cy.get('.no-tokens__add').click();
  cy.getWithCustomTimeout('.token-list-item').eq(0).should('exist');
  cy.get('.token-list-item').eq(0).click();
  cy.getWithCustomTimeout('.select-hub').should('exist');
  cy.contains('Select Hub');
}
