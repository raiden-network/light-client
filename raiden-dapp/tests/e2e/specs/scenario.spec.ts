import {
  navigateToDisclaimer,
  navigateToSelectHub,
  navigateToNotificationPanel,
  navigateToAccountMenu,
  navigateToBackupState,
  navigateToTokenSelect,
  navigateToConnectNewTokenFromTokenOverlay,
  navigateBackToTransferScreenFromOverlay,
  navigateToTokenDepositFromTransferScreen,
  navigateToChannelsList,
  navigateToRaidenAccount,
  navigateBackToAccountMenu,
  navigateToWithdrawal,
  navigateToUDC,
  navigateToDownloadLogs,
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
  makeDirectTransfer,
  makeMediatedTransfer,
  downloadState,
  enterDepositTokenAmountForOpenedChannel,
  enterTokenWithdrawalAmoutFromChannelsList,
  enterETHAmountToTransferFromRaidenAccount,
  enterUDCWithdrawalAmount,
} from '../utils/user-interaction';
import {
  mintAndDepositUtilityTokenFromSelectHubScreen,
  mintConnectedTokenFromSelectHubScreen,
  openChannel,
  depositTokensToOpenedChannel,
  withdrawTokens,
  transferETHToRaidenAccount,
  withdrawTokensBackToMainAccount,
  withdrawUDCTokens,
  closeChannel,
  settleChannel,
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
    enterTransferAddress(uiTimeout, partnerAddress);
    enterTransferAmount(uiTimeout);
    makeDirectTransfer(uiTimeout);
    enterTransferAddress(uiTimeout, thirdAddres);
    enterTransferAmount(uiTimeout);
    makeMediatedTransfer(uiTimeout);
    navigateToAccountMenu();
    navigateToBackupState();
    downloadState();
    connectToDApp(false);
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
