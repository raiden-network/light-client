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
    const timeout = 3 * 60 * 1000;

    if (subject) {
      cy.get(subject).get(selector, { timeout });
    } else {
      cy.get(selector, { timeout });
    }
  },
);
