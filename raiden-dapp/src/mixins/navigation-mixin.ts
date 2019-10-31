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

  navigateToSelectTransferTarget(token: string) {
    this.$router.push({
      name: RouteNames.TRANSFER,
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
