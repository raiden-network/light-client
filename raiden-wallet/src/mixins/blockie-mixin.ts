import { Component, Vue } from 'vue-property-decorator';

@Component
export default class BlockieMixin extends Vue {
  $blockie(address: string) {
    return this.$identicon.getIdenticon(address);
  }
}
