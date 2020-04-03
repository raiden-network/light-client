jest.mock('vue-router');
import Mocked = jest.Mocked;
import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import VueRouter from 'vue-router';
import { RouteNames } from '@/router/route-names';
import Vuetify from 'vuetify';
import store from '@/store/index';
import GeneralMenu from '@/components/GeneralMenu.vue';

Vue.use(Vuetify);

describe('GeneralMenu.vue', () => {
  let wrapper: Wrapper<GeneralMenu>;
  let router: Mocked<VueRouter>;
  let vuetify: typeof Vuetify;

  beforeEach(async () => {
    vuetify = new Vuetify();
    router = new VueRouter() as Mocked<VueRouter>;
    store.commit('loadComplete');
    store.commit('account', 'testAccount');
    wrapper = mount(GeneralMenu, {
      vuetify,
      store,
      mocks: {
        $router: router,
        $t: (msg: string) => msg
      }
    });

    await wrapper.vm.$nextTick();
  });

  test('displays account details title', async () => {
    const accountDetailsTitle = wrapper.find(
      '.general-screen-menu__account-details--title'
    );

    expect(accountDetailsTitle.text()).toBe('general-menu.account-details');
  });

  test('displays address', async () => {
    store.commit('account', '0x31aA9D3E2bd38d22CA3Ae9be7aae1D518fe46043');
    await wrapper.vm.$nextTick();
    const addressTitle = wrapper
      .findAll('.general-screen-menu__account-details--address')
      .at(0);
    const address = wrapper
      .findAll('.general-screen-menu__account-details--address')
      .at(1);

    expect(addressTitle.text()).toBe('general-menu.address');
    expect(address.text()).toBe('0x31aA9D3E2bd38d22CA3Ae9be7aae1D518fe46043');
  });

  test('displays eth', async () => {
    store.commit('balance', '12.0');
    await wrapper.vm.$nextTick();
    const ethTitle = wrapper.find(
      '.general-screen-menu__account-details__eth--currency'
    );
    const eth = wrapper.find(
      '.general-screen-menu__account-details__eth--balance'
    );

    expect(ethTitle.text()).toBe('general-menu.currency');
    expect(eth.text()).toBe('12.000');
  });

  test('displays one menu item', () => {
    const generalMenuItems = wrapper.findAll('.general-screen-menu__menu');

    expect(generalMenuItems.length).toBe(1);
  });

  test('backup state menu item', () => {
    const backupStateMenuItem = wrapper
      .findAll('.general-screen-menu__menu__list-items')
      .at(0);
    const backupStateTitle = backupStateMenuItem.find('.v-list-item__title');
    const backupStateSubtitle = backupStateMenuItem.find(
      '.v-list-item__subtitle'
    );
    const backupStateButton = backupStateMenuItem.find('button');
    backupStateButton.trigger('click');

    expect(backupStateTitle.text()).toEqual(
      'general-menu.menu-items.backup-state-title'
    );
    expect(backupStateSubtitle.text()).toEqual(
      'general-menu.menu-items.backup-state-subtitle'
    );
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.BACKUP_STATE
      })
    );
  });

  test('report bugs menu item', () => {
    const reportBugsMenuItem = wrapper
      .findAll('.general-screen-menu__menu__list-items')
      .at(1);
    const reportBugsTitle = reportBugsMenuItem.find('.v-list-item__title');
    const reportBugsSubtitle = reportBugsMenuItem.find(
      '.v-list-item__subtitle'
    );

    expect(reportBugsTitle.text()).toEqual(
      'general-menu.menu-items.report-bugs-title'
    );
    expect(reportBugsSubtitle.text()).toBe(
      'general-menu.menu-items.report-bugs-subtitle'
    );
  });
});
