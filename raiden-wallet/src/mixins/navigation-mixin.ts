import { Component, Vue } from 'vue-property-decorator';
import { RouteNames } from '@/route-names';

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

  navigateToDeposit(token: string, partner: string) {
    this.$router.push({
      name: RouteNames.DEPOSIT,
      params: {
        token: token,
        partner: partner
      }
    });
  }

  navigateToSelectPaymentTarget(token: string) {
    this.$router.push({
      name: RouteNames.SELECT_TARGET,
      params: { token: token }
    });
  }

  navigateToTokenSelect() {
    this.$router.push({
      name: RouteNames.SELECT_TOKEN
    });
  }

  onBackClicked() {
    switch (this.$route.name) {
      case RouteNames.ABOUT:
        this.navigateToHome();
        break;
      case RouteNames.SELECT_TARGET:
        this.navigateToHome();
        break;
      case RouteNames.SELECT_TOKEN:
        this.navigateToHome();
        break;
      case RouteNames.SELECT_HUB:
        this.navigateToTokenSelect();
        break;
      case RouteNames.CHANNELS:
        this.navigateToHome();
        break;
      case RouteNames.DEPOSIT:
        this.navigateToSelectHub(this.$route.params.token);
        break;
    }
  }
}
