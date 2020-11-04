import {
  navigateToDisclaimer,
  navigateToSelectHub,
  navigateToNotificationPanel,
} from '../utils/navigation';
import {
  acceptDisclaimer,
  connectToDApp,
  enterAndSelectHub,
  enterChannelDepositAmount,
  deleteTopNotification,
  closeNotificationPanel,
  enterTransferAddress,
  enterTransferAmount,
  makeMediatedTransfer,
} from '../utils/user-interaction';
import {
  mintAndDepositUtilityTokenFromSelectHubScreen,
  mintConnectedTokenFromSelectHubScreen,
  openChannel,
} from '../utils/blockchain-interaction';

describe('dApp e2e tests', () => {
  const uiTimeout = 3000;
  const partnerAddress = '0xCBC49ec22c93DB69c78348C90cd03A323267db86';
  const thirdAddres = '0x517aAD51D0e9BbeF3c64803F86b3B9136641D9ec';

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
    connectToDApp();
    navigateToSelectHub();
    mintAndDepositUtilityTokenFromSelectHubScreen();
    mintConnectedTokenFromSelectHubScreen();
    enterAndSelectHub(uiTimeout, partnerAddress);
    enterChannelDepositAmount(uiTimeout);
    openChannel();
    navigateToNotificationPanel();
    deleteTopNotification();
    closeNotificationPanel();
    enterTransferAddress(uiTimeout, thirdAddres);
    enterTransferAmount(uiTimeout);
    makeMediatedTransfer(uiTimeout);
  });
});
