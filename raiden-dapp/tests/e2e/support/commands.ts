export {};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace Cypress {
    interface Chainable {
      getWithCustomTimeout: (selector: string) => Cypress.Chainable<JQuery<HTMLElement>>;
    }
  }
}

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
