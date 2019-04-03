import { IdenticonPlugin } from '@/plugins/identicon-plugin';
import Vue, { VueConstructor } from 'vue';
import { IdenticonCache } from '@/services/identicon-cache';
import { createLocalVue } from '@vue/test-utils';
import { RaidenPlugin } from '@/plugins/raiden';
import RaidenService from '@/services/raiden-service';

Vue.config.productionTip = false;

describe('plugins', function() {
  let localVue: VueConstructor<Vue>;
  beforeEach(() => {
    localVue = createLocalVue();
  });

  it('should install identicon cache', function() {
    expect(localVue.prototype.$identicon).toBeUndefined();
    localVue.use(IdenticonPlugin);
    expect(localVue.prototype.$identicon).toBeInstanceOf(IdenticonCache);
  });

  it('should install RaidenService', function() {
    expect(localVue.prototype.$raiden).toBeUndefined();
    localVue.use(RaidenPlugin);
    expect(localVue.prototype.$raiden).toBeInstanceOf(RaidenService);
  });
});
