import { Component, Vue } from 'vue-property-decorator';

@Component
export default class BlockieMixin extends Vue {
  $blockie(address?: string) {
    if (address) {
      return this.$identicon.getIdenticon(address);
    } else {
      return this.$identicon.getIdenticon('0x000');
    }
  }
}
