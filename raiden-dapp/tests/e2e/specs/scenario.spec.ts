import {
  closeChannel,
  depositTokensToOpenedChannel,
  mintAndDepositUtilityTokenFromSelectHubScreen,
  mintConnectedTokenFromSelectHubScreen,
  openChannel,
  settleChannel,
  transferETHToRaidenAccount,
  withdrawTokens,
  withdrawTokensBackToMainAccount,
  withdrawUDCTokens,
} from '../utils/blockchain-interaction';
import {
  navigateBackToAccountMenu,
  navigateBackToTransferScreenFromOverlay,
  navigateToAccountMenu,
  navigateToBackupState,
  navigateToChannelsList,
  navigateToConnectNewTokenFromTokenOverlay,
  navigateToDisclaimer,
  navigateToDownloadLogs,
  navigateToNotificationPanel,
  navigateToRaidenAccount,
  navigateToSelectHub,
  navigateToTokenDepositFromTransferScreen,
  navigateToTokenSelect,
  navigateToUDC,
  navigateToWithdrawal,
} from '../utils/navigation';
import {
  acceptDisclaimer,
  closeNotificationPanel,
  connectToDApp,
  deleteTopNotification,
  downloadState,
  enterAndSelectHub,
  enterChannelDepositAmount,
  enterDepositTokenAmountForOpenedChannel,
  enterETHAmountToTransferFromRaidenAccount,
  enterTokenWithdrawalAmoutFromChannelsList,
  enterTransferAddress,
  enterTransferAmount,
  enterUDCWithdrawalAmount,
  makeDirectTransfer,
  makeMediatedTransfer,
} from '../utils/user-interaction';

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
    deleteTopNotification(); // This must be the sticky backup notification.
    closeNotificationPanel();
    enterTransferAddress(uiTimeout, partnerAddress);
    enterTransferAmount(uiTimeout);
    makeDirectTransfer(uiTimeout);
    enterTransferAddress(uiTimeout, thirdAddres);
    enterTransferAmount(uiTimeout);
    makeMediatedTransfer(uiTimeout);
    navigateToAccountMenu();
    navigateToBackupState();
    downloadState();
    connectToDApp();
    navigateToTokenSelect();
    navigateToConnectNewTokenFromTokenOverlay();
    navigateBackToTransferScreenFromOverlay();
    navigateToTokenDepositFromTransferScreen();
    enterDepositTokenAmountForOpenedChannel(uiTimeout);
    depositTokensToOpenedChannel();
    navigateToChannelsList();
    enterTokenWithdrawalAmoutFromChannelsList(uiTimeout);
    withdrawTokens();
    closeChannel();
    settleChannel();
    navigateToAccountMenu();
    navigateToRaidenAccount();
    enterETHAmountToTransferFromRaidenAccount(uiTimeout);
    transferETHToRaidenAccount();
    navigateBackToAccountMenu();
    navigateToWithdrawal();
    withdrawTokensBackToMainAccount();
    navigateBackToAccountMenu();
    navigateToUDC();
    enterUDCWithdrawalAmount(uiTimeout);
    withdrawUDCTokens();
    navigateBackToAccountMenu();
    navigateToDownloadLogs();
  });
});
