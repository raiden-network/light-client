import { Component, Vue } from 'vue-property-decorator';

import { RouteNames } from '@/router/route-names';

@Component
export default class NavigationMixin extends Vue {
  navigateToSelectHub(token: string) {
    this.$router.push({
      name: RouteNames.SELECT_HUB,
      params: {
        token,
      },
    });
  }

  navigateToHome() {
    this.$router.push({ name: RouteNames.HOME });
  }

  navigateToTransfer(token: string) {
    this.$router.push({
      name: RouteNames.TRANSFER,
      params: {
        token,
      },
    });
  }

  navigateToOpenChannel(token: string, partner: string) {
    this.$router.push({
      name: RouteNames.OPEN_CHANNEL,
      params: {
        token: token,
        partner: partner,
      },
    });
  }

  navigateToChannels(token: string) {
    this.$router.push({
      name: RouteNames.CHANNELS,
      params: {
        token: token,
      },
    });
  }

  navigateToSelectTransferTarget(token: string, target?: string, amount?: string) {
    const route = {
      name: RouteNames.TRANSFER,
      params: { token: token },
      query: {},
    };
    if (target && amount) {
      route.query = { target, amount };
    }
    this.$router.push(route);
  }

  navigateToTokenSelect() {
    this.$router.push({
      name: RouteNames.SELECT_TOKEN,
    });
  }

  navigateToTransferSteps(token: string, target: string, amount: string) {
    this.$router.push({
      name: RouteNames.TRANSFER_STEPS,
      params: { token, target },
      query: { amount },
    });
  }

  navigateToNotifications() {
    this.$router.push({
      name: RouteNames.NOTIFICATIONS,
    });
  }

  navigateToAccount() {
    this.$router.push({
      name: RouteNames.ACCOUNT_ROOT,
    });
  }

  navigateToBackupState() {
    this.$router.push({
      name: RouteNames.ACCOUNT_BACKUP,
    });
  }

  navigateToRaidenAccountTransfer() {
    this.$router.push({
      name: RouteNames.ACCOUNT_RAIDEN,
    });
  }

  navigateToSettings() {
    this.$router.push({
      name: RouteNames.ACCOUNT_SETTINGS,
    });
  }

  navigateToWithdrawal() {
    this.$router.push({
      name: RouteNames.ACCOUNT_WITHDRAWAL,
    });
  }

  navigateToUDC() {
    this.$router.push({
      name: RouteNames.ACCOUNT_UDC,
    });
  }

  onModalBackClicked() {
    this.$router.go(-1);
  }

  onBackClicked() {
    switch (this.$route.name) {
      case RouteNames.TRANSFER_STEPS:
        this.navigateToSelectTransferTarget(
          this.$route.params.token,
          this.$route.params.target,
          this.$route.params.amount,
        );
        break;
      case RouteNames.CHANNELS:
        this.navigateToTransfer(this.$route.params.token);
        break;
      case RouteNames.SELECT_TOKEN:
        this.$router.go(-1); // Preserve current token without knowing it.
        break;
      case RouteNames.SELECT_HUB:
        this.navigateToTokenSelect();
        break;
      case RouteNames.OPEN_CHANNEL:
        this.navigateToSelectHub(this.$route.params.token);
        break;
      default:
        break;
    }
  }
}
