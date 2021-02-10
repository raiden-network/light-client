import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import flushPromises from 'flush-promises';
import Vue from 'vue';
import VueRouter from 'vue-router';
import Vuetify from 'vuetify';
import Vuex from 'vuex';

import ActionButton from '@/components/ActionButton.vue';
import { RouteNames } from '@/router/route-names';
import store from '@/store';
import DisclaimerRoute from '@/views/DisclaimerRoute.vue';
import Mocked = jest.Mocked;

Vue.use(Vuetify);
Vue.use(Vuex);

describe('DisclaimerRoute.vue', () => {
  let vuetify: Vuetify;
  let router: Mocked<VueRouter>;
  let wrapper: Wrapper<DisclaimerRoute>;
  let actionButton: Wrapper<Vue>;

  beforeEach(() => {
    process.env.VUE_APP_IMPRINT = 'https://custom-imprint.test';
    process.env.VUE_APP_TERMS = 'https://custom-terms.test';

    vuetify = new Vuetify();
    router = new VueRouter() as Mocked<VueRouter>;
    router.push = jest.fn().mockResolvedValue(null);
    wrapper = mount(DisclaimerRoute, {
      vuetify,
      store,
      stubs: ['i18n'],
      mocks: {
        $router: router,
        $route: { query: {} },
        $t: (msg: string) => msg,
      },
    });
    actionButton = wrapper.findComponent(ActionButton).find('button');
  });

  afterEach(() => {
    delete process.env.VUE_APP_IMPRINT;
    delete process.env.VUE_APP_TERMS;
  });

  async function clickAcceptCheckbox() {
    wrapper.find('.disclaimer__content__accept-checkbox').find('input').trigger('click');
    await wrapper.vm.$nextTick();
  }

  async function clickPersistCheckbox() {
    wrapper.find('.disclaimer__content__persist-checkbox').find('input').trigger('click');
    await wrapper.vm.$nextTick();
  }

  async function clickActionButton() {
    actionButton.trigger('click');
    await wrapper.vm.$nextTick();
  }

  function actionButtonIsDisabled(): boolean {
    return actionButton.element.getAttribute('disabled') === 'disabled';
  }

  test('accept button disabled if not clicked according checkbox', () => {
    expect(wrapper.vm.$data.checkedAccept).toBe(false);
    expect(actionButtonIsDisabled()).toBe(true);
  });

  test('accept button enabled if clicked according checkbox', async () => {
    expect(actionButtonIsDisabled()).toBe(true);

    await clickAcceptCheckbox();
    await flushPromises();

    expect(actionButtonIsDisabled()).toBe(false);
  });

  test('accept button commits acceptance to state', async () => {
    expect(store.state.disclaimerAccepted).toBe(false);

    await clickAcceptCheckbox();
    await clickActionButton();

    expect(store.state.disclaimerAccepted).toBe(true);
  });

  test('accept button commits acceptance with persistence flag', async () => {
    expect(store.state.persistDisclaimerAcceptance).toBe(false);

    await clickAcceptCheckbox();
    await clickPersistCheckbox();
    await clickActionButton();

    expect(store.state.persistDisclaimerAcceptance).toBe(true);
  });

  test('accept button navigates to home route per default', async () => {
    await clickAcceptCheckbox();
    await clickActionButton();

    expect(router.push).toHaveBeenCalledWith({ name: RouteNames.HOME });
  });

  test('accept button navigates to redirect target if given in query', async () => {
    const redirectTo = 'connect/0x5Fc523e13fBAc2140F056AD7A96De2cC0C4Cc63A';
    wrapper.vm.$route.query = { redirectTo };

    await clickAcceptCheckbox();
    await clickActionButton();

    expect(router.push).toHaveBeenCalledWith({ path: redirectTo });
  });

  test('displays privacy policy and terms if env variables are set', () => {
    const imprintTermsHeader = wrapper.find('.imprint_terms_header');
    const imprintTermsBody = wrapper.find('.disclaimer__content__text__imprint-terms-body');

    expect(imprintTermsHeader.exists()).toBe(true);
    expect(imprintTermsBody.exists()).toBe(true);
  });
});
