import '@cypress/code-coverage/support';
import './commands';
import 'cypress-jest-adapter';

Cypress.on('uncaught:exception', function ignore() {
  return false;
});
