import { Component, Emit, Vue } from 'vue-property-decorator';

import type { EthereumProvider, EthereumProviderFactory } from '@/services/ethereum-provider';

@Component
export default class EthereumProviderDialogMixin extends Vue {
  providerFactory!: EthereumProviderFactory;
  linkingInProgress = false;
  linkingFailed = false;

  get canLink() {
    return true;
  }

  get providerOptions() {
    return {};
  }

  async link() {
    const provider = await this.providerFactory.link(this.providerOptions);
    this.emitLinkEstablished(provider);
  }

  @Emit('linkEstablished')
  emitLinkEstablished(linkedProvider: EthereumProvider) {
    return linkedProvider;
  }

  @Emit('cancel')
  emitCancel() {
    // pass
  }
}
