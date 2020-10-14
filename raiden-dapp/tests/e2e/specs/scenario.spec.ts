import { navigateToDisclaimer } from '../utils/navigation';
import { acceptDisclaimer, connectToDapp } from '../utils/user-interaction';

describe('dApp e2e tests', () => {
  before(async () => {
    const allIndexedDBs = await window.indexedDB.databases();
    allIndexedDBs.forEach((indexedDB) => {
      window.indexedDB.deleteDatabase(indexedDB.name);
    });
  });

  it('should run all dApp e2e scenarios', () => {
    cy.viewport('macbook-13');
    navigateToDisclaimer();
    acceptDisclaimer();
    connectToDapp();
  });
});
