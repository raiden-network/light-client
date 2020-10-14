import { navigateToDisclaimer, navigateToSelectHub } from '../utils/navigation';
import {
  acceptDisclaimer,
  connectToDapp,
  enterAndSelectHub,
  enterChannelDepositAmount,
} from '../utils/user-interaction';
import {
  mintAndDepositUtilityTokenFromSelectHubScreen,
  mintConnectedTokenFromSelectHubScreen,
  openChannel,
} from '../utils/blockchain-interaction';

describe('dApp e2e tests', () => {
  const uiTimeout = 3000;
  const partnerAddress = '0xCBC49ec22c93DB69c78348C90cd03A323267db86';

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
    navigateToSelectHub();
    mintAndDepositUtilityTokenFromSelectHubScreen();
    mintConnectedTokenFromSelectHubScreen();
    enterAndSelectHub(uiTimeout, partnerAddress);
    enterChannelDepositAmount(uiTimeout);
    openChannel();
  });
});
