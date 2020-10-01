import {
  navigateToDisclaimer,
  navigateToSelectHub,
  navigateToNotificationPanel,
  navigateToAccountMenu,
  navigateToBackupState,
  navigateToTokenSelect,
  navigateToConnectNewToken,
  navigateBackToTransferScreen,
  navigateToTokenDeposit,
  navigateToChannelsList,
  navigateToRaidenAccount,
  navigateToWithdrawal,
  navigateToUDC,
  navigateToDownloadLogs
} from '../utils/navigation-utils';
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
  downloadState,
  depositTokensToOpenedChannel,
  withdrawTokens,
  withdrawUDCTokens
} from '../utils/user-interaction-utils';
import {
  mintAndDepositUtilityToken,
  mintSelectedToken,
  openChannel,
  transferETHToRaidenAccount,
  withdrawTokensBackToMainAccount
} from '../utils/blockchain-interaction-utils';

it('', () => {
  navigateToDisclaimer();
  acceptDisclaimer();
  connectToDApp();
  navigateToSelectHub();
  mintAndDepositUtilityToken();
  mintSelectedToken();
  enterAndSelectHub();
  enterChannelDepositAmount();
  openChannel();
  navigateToNotificationPanel();
  deleteTopNotification();
  closeNotificationPanel();
  enterTransferAddress();
  enterTransferAmount();
  makeDirectTransfer();
  navigateToAccountMenu();
  navigateToBackupState();
  downloadState();
  navigateToTokenSelect();
  navigateToConnectNewToken();
  navigateBackToTransferScreen();
  navigateToTokenDeposit();
  depositTokensToOpenedChannel();
  navigateToChannelsList()
  withdrawTokens();
  navigateToRaidenAccount();
  transferETHToRaidenAccount();
  navigateToWithdrawal();
  withdrawTokensBackToMainAccount();
  navigateToUDC();
  withdrawUDCTokens();
  navigateToDownloadLogs();
});
