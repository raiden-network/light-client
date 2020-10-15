import '@cypress/code-coverage/support';
import './commands';
import 'cypress-jest-adapter';

Cypress.on('uncaught:exception', () => {
  return false;
});
