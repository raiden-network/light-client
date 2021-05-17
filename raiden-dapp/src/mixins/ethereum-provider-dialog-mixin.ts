import { Component, Emit, Vue } from 'vue-property-decorator';
import { createNamespacedHelpers } from 'vuex';

import type {
  EthereumProvider,
  EthereumProviderFactory,
  EthereumProviderOptions,
} from '@/services/ethereum-provider';

const { mapGetters, mapMutations } = createNamespacedHelpers('userSettings');

@Component({
  methods: {
    ...mapGetters(['getEthereumProviderOptions']),
    ...mapMutations(['saveEthereumProviderOptions']),
  },
})
export default class EthereumProviderDialogMixin extends Vue {
  linkingFailed = false;
  linkingInProgress = false;
  providerFactory!: EthereumProviderFactory;

  getEthereumProviderOptions!: () => (providerName: string) => EthereumProviderOptions;
  saveEthereumProviderOptions!: (payload: {
    providerName: string;
    providerOptions: EthereumProviderOptions;
  }) => void;

  // Overwrite if necessary (i.e. if some options are required to be set).
  get canLink(): boolean {
    return true;
  }

  // Overwrite if there are any options to use.
  get providerOptions(): EthereumProviderOptions {
    return {};
  }

  created(): void {
    this.checkCorrectMixinUsage();
    this.loadSavedProviderOptions();
  }

  checkCorrectMixinUsage(): void {
    if (this.providerFactory === undefined) {
      throw new Error('Incorrect usage of mixin. Missing definition of provider to use.');
    }

    // TODO: check if all provider options are defined in components state.
  }

  loadSavedProviderOptions(): void {
    const savedProviderOptions = this.getEthereumProviderOptions()(
      this.providerFactory.providerName,
    );

    for (const [optionName, optionValue] of Object.entries(savedProviderOptions)) {
      (this as any)[optionName] = optionValue; // eslint-disable-line @typescript-eslint/no-explicit-any
    }
  }

  saveProviderOptions(): void {
    this.saveEthereumProviderOptions({
      providerName: this.providerFactory.providerName,
      providerOptions: this.providerOptions,
    });
  }

  async link(): Promise<void> {
    if (!this.canLink || this.linkingInProgress) {
      throw new Error('Can not link now!');
    }

    this.linkingFailed = false;
    this.linkingInProgress = true;

    try {
      const provider = await this.providerFactory.link(this.providerOptions);
      this.saveProviderOptions();
      this.emitLinkEstablished(provider);
    } catch {
      this.linkingFailed = true;
    } finally {
      this.linkingInProgress = false;
    }
  }

  @Emit('linkEstablished')
  emitLinkEstablished(linkedProvider: EthereumProvider): EthereumProvider {
    return linkedProvider;
  }

  @Emit('cancel')
  emitCancel(): void {
    // pass
  }
}
