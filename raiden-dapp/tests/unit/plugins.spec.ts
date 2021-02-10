import { createLocalVue } from '@vue/test-utils';
import type { VueConstructor } from 'vue';
import Vue from 'vue';

import { IdenticonPlugin } from '@/plugins/identicon-plugin';
import { RaidenPlugin } from '@/plugins/raiden';
import { IdenticonCache } from '@/services/identicon-cache';
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
