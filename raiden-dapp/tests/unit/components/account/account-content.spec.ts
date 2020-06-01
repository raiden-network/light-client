import AccountContent from '@/components/account/AccountContent.vue';

jest.mock('vue-router');
import flushPromises from 'flush-promises';
import Mocked = jest.Mocked;
import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import VueRouter from 'vue-router';
import { RouteNames } from '@/router/route-names';
import Vuetify from 'vuetify';
import store from '@/store';

Vue.use(Vuetify);

describe('AccountContent.vue', () => {
  let wrapper: Wrapper<AccountContent>;
  let router: Mocked<VueRouter>;
  let vuetify: typeof Vuetify;
  const $raiden = {
    getMainAccount: jest.fn().mockResolvedValue('0x1'),
    getAccount: jest.fn().mockResolvedValue('0x2')
  };
  beforeEach(async () => {
    vuetify = new Vuetify();
    router = new VueRouter() as Mocked<VueRouter>;
    store.commit('loadComplete');
    store.commit('account', 'testAccount');
    wrapper = mount(AccountContent, {
      vuetify,
      store,
      mocks: {
        $router: router,
        $t: (msg: string) => msg,
        $raiden
      }
    });

    await wrapper.vm.$nextTick();
  });

  test('displays address', async () => {
    store.commit('account', '0x31aA9D3E2bd38d22CA3Ae9be7aae1D518fe46043');
    await wrapper.vm.$nextTick();
    const addressTitle = wrapper
      .findAll('.account-content__account-details__address')
      .at(0);
    const addressDesktop = wrapper.find(
      '.account-content__account-details__address__desktop'
    );
    const addressMobile = wrapper.find(
      '.account-content__account-details__address__mobile'
    );

    expect(addressTitle.text()).toBe('account-content.address');
    expect(addressDesktop.text()).toBe(
      '0x31aA9D3E2bd38d22CA3Ae9be7aae1D518fe46043'
    );
    expect(addressMobile.text()).toBe('0x31...6043');
  });

  test('displays eth', async () => {
    store.commit('balance', '12.0');
    await wrapper.vm.$nextTick();
    const ethTitle = wrapper.find(
      '.account-content__account-details__eth__currency'
    );
    const eth = wrapper.find('.account-content__account-details__eth__balance');

    expect(ethTitle.text()).toBe('account-content.currency');
    expect(eth.text()).toBe('12.000');
  });

  test('displays one menu item', () => {
    const menuItems = wrapper.findAll('.account-content__menu');

    expect(menuItems.length).toBe(1);
  });

  test('backup state menu item', () => {
    const backupStateMenuItem = wrapper
      .findAll('.account-content__menu__list-items')
      .at(1);
    const backupStateTitle = backupStateMenuItem.find('.v-list-item__title');
    const backupStateSubtitle = backupStateMenuItem.find(
      '.v-list-item__subtitle'
    );
    const backupStateButton = backupStateMenuItem.find('button');
    backupStateButton.trigger('click');

    expect(backupStateTitle.text()).toEqual(
      'account-content.menu-items.backup-state.title'
    );
    expect(backupStateSubtitle.text()).toEqual(
      'account-content.menu-items.backup-state.subtitle'
    );
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.ACCOUNT_BACKUP
      })
    );
  });

  test('report bugs menu item', () => {
    const reportBugsMenuItem = wrapper
      .findAll('.account-content__menu__list-items')
      .at(2);
    const reportBugsTitle = reportBugsMenuItem.find('.v-list-item__title');
    const reportBugsSubtitle = reportBugsMenuItem.find(
      '.v-list-item__subtitle'
    );

    expect(reportBugsTitle.text()).toEqual(
      'account-content.menu-items.report-bugs.title'
    );
    expect(reportBugsSubtitle.text()).toBe(
      'account-content.menu-items.report-bugs.subtitle'
    );
  });

  test('udc menu item', () => {
    const udcMenuItem = wrapper
      .findAll('.account-content__menu__list-items')
      .at(0);
    const udcMenuTitle = udcMenuItem.find('.v-list-item__title');
    const udcMenuSubtitle = udcMenuItem.find('.v-list-item__subtitle');

    expect(udcMenuTitle.text()).toEqual('account-content.menu-items.udc.title');
    expect(udcMenuSubtitle.text()).toBe(
      'account-content.menu-items.udc.subtitle'
    );

    udcMenuItem.find('button').trigger('click');

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.ACCOUNT_UDC
      })
    );
  });

  test('show raiden account menu item, if connected via sub key', () => {
    expect(wrapper.vm.$data.menuItems[0].title).toEqual(
      'account-content.menu-items.raiden-account.title'
    );
  });

  test('calls method for downloading logs', async () => {
    // @ts-ignore
    wrapper.vm.downloadLogs = jest.fn();
    const reportBugsMenuItem = wrapper
      .findAll('.account-content__menu__list-items')
      .at(2);
    const reportBugsButton = reportBugsMenuItem.find('button');
    reportBugsButton.trigger('click');
    await wrapper.vm.$nextTick();

    // @ts-ignore
    expect(wrapper.vm.downloadLogs).toBeCalled();
  });

  test('settings menu item when disconnected', async () => {
    store.commit('reset');
    wrapper = mount(AccountContent, {
      vuetify,
      store,
      mocks: {
        $router: router,
        $t: (msg: string) => msg,
        $raiden
      }
    });
    await wrapper.vm.$nextTick();
    await flushPromises();

    const settingsMenuItem = wrapper
      .findAll('.account-content__menu__list-items')
      .at(0);
    const settingsMenuTitle = settingsMenuItem.find('.v-list-item__title');
    const settingsMenuSubtitle = settingsMenuItem.find(
      '.v-list-item__subtitle'
    );
    settingsMenuItem.find('button').trigger('click');

    expect(settingsMenuTitle.text()).toEqual(
      'account-content.menu-items.settings.title'
    );
    expect(settingsMenuSubtitle.text()).toEqual(
      'account-content.menu-items.settings.subtitle'
    );
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.ACCOUNT_SETTINGS
      })
    );
  });
});
