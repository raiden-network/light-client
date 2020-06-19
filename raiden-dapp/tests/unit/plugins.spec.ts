import { IdenticonPlugin } from '@/plugins/identicon-plugin';
import Vue, { VueConstructor } from 'vue';
import { IdenticonCache } from '@/services/identicon-cache';
import { createLocalVue } from '@vue/test-utils';
import { RaidenPlugin } from '@/plugins/raiden';
import RaidenService from '@/services/raiden-service';

jest.mock('@/i18n', () => jest.fn());

Vue.config.productionTip = false;

describe('plugins', () => {
  let localVue: VueConstructor;
  beforeEach(() => {
    localVue = createLocalVue();
  });

  test('installs the identicon cache', () => {
    expect(localVue.prototype.$identicon).toBeUndefined();
    localVue.use(IdenticonPlugin);
    expect(localVue.prototype.$identicon).toBeInstanceOf(IdenticonCache);
  });

  test('installs the RaidenService', () => {
    expect(localVue.prototype.$raiden).toBeUndefined();
    localVue.use(RaidenPlugin);
    expect(localVue.prototype.$raiden).toBeInstanceOf(RaidenService);
  });
});
