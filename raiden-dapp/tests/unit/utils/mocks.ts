import type VueI18n from 'vue-i18n';

export const $identicon = () => ({
  getIdenticon: jest.fn().mockReturnValue(''),
});

export const $t = (key: VueI18n.Path, values?: VueI18n.Values): VueI18n.TranslateResult =>
  `${key} values: ${JSON.stringify(values)}`;
