import type VueI18n from 'vue-i18n';

export * from './service-worker';

export const $identicon = () => ({
  getIdenticon: jest.fn().mockReturnValue(''),
});

export const $t = (key: VueI18n.Path): VueI18n.TranslateResult => `${key}`;

export class MockedJsonRpcProvider {
  getNetwork = jest.fn().mockResolvedValue({ chainId: 5 });
  on = jest.fn();
}

export class MockedJsonRpcProviderWithRequestHandler extends MockedJsonRpcProvider {
  request = jest.fn().mockResolvedValue(true);
}
