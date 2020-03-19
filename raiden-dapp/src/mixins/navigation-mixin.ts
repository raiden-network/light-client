import { Component, Vue } from 'vue-property-decorator';
import { RouteNames } from '@/router/route-names';

@Component
export default class NavigationMixin extends Vue {
  navigateToSelectHub(token: string) {
    this.$router.push({
      name: RouteNames.SELECT_HUB,
      params: {
        token: token
      }
    });
  }

  navigateToHome() {
    this.$router.push({
      name: RouteNames.HOME
    });
  }

  navigateToOpenChannel(token: string, partner: string) {
    this.$router.push({
      name: RouteNames.OPEN_CHANNEL,
      params: {
        token: token,
        partner: partner
      }
    });
  }

  navigateToChannels(token: string) {
    this.$router.push({
      name: RouteNames.CHANNELS,
      params: {
        token: token
      }
    });
  }

  navigateToSelectTransferTarget(
    token: string,
    target?: string,
    amount?: string
  ) {
    const route = {
      name: RouteNames.TRANSFER,
      params: { token: token },
      query: {}
    };
    if (target && amount) {
      route.query = { target, amount };
    }
    this.$router.push(route);
  }

  navigateToTokenSelect() {
    this.$router.push({
      name: RouteNames.SELECT_TOKEN
    });
  }

  navigateToTransferSteps(target: string, amount: string) {
    this.$router.push({
      name: RouteNames.TRANSFER_STEPS,
      params: { target },
      query: { amount }
    });
  }

  navigateToGeneralHome() {
    this.$router.push({
      name: RouteNames.GENERAL_HOME
    });
  }

  navigateToBackupState() {
    this.$router.push({
      name: RouteNames.BACKUP_STATE
    });
  }

  onGeneralBackClicked() {
    this.$router.go(-1);
  }

  onBackClicked() {
    switch (this.$route.name) {
      case RouteNames.TRANSFER_STEPS:
        this.navigateToSelectTransferTarget(
          this.$route.params.token,
          this.$route.params.target,
          this.$route.params.amount
        );
        break;
      case RouteNames.TRANSFER:
      case RouteNames.CHANNELS:
      case RouteNames.SELECT_TOKEN:
        this.navigateToHome();
        break;
      case RouteNames.SELECT_HUB:
        this.navigateToTokenSelect();
        break;
      case RouteNames.OPEN_CHANNEL:
        this.navigateToSelectHub(this.$route.params.token);
        break;
    }
  }
}
