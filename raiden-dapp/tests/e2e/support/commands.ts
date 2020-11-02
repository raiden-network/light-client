Cypress.Commands.add(
  'getWithCustomTimeout',
  {
    prevSubject: 'optional',
  },
  (subject, selector) => {
    if (subject) {
      cy.get(subject).get(selector, { timeout: 1800000 });
    } else {
      cy.get(selector, { timeout: 1800000 });
    }
  },
);
