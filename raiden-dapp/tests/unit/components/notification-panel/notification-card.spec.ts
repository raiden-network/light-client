jest.mock('vue-router');

import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import VueRouter from 'vue-router';
import Vuex  from 'vuex';
import { TestData } from '../../data/mock-data';
import Mocked = jest.Mocked;
import { RouteNames } from '@/router/route-names';
import Filters from '@/filters';
import NotificationCard from '@/components/notification-panel/NotificationCard.vue';

Vue.use(Vuetify);
Vue.use(Vuex);
Vue.filter('formatDate', Filters.formatDate);

const vuetify = new Vuetify();
const $router = new VueRouter() as Mocked<VueRouter>;
const $raiden = { fetchAndUpdateTokenData: jest.fn() };
const notificationDelete = jest.fn((_id: number) => null);

function createWrapper(
  notification = TestData.notifications
): Wrapper<NotificationCard> {
  const state = { blockNumber: 100 };
  const notificationsModule = {
    namespaced: true,
    mutations: { notificationDelete },
  };

  const store = new Vuex.Store({
    state,
    modules: { notifications: notificationsModule }
  });

  return mount(NotificationCard, {
    vuetify,
    store,
    mocks: {
      $router,
      $raiden,
      $t: (msg: string) => msg,
    },
    propsData: { notification },
  });
}

describe('NotificationCard.vue', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('displays notification title', () => {
    const wrapper = createWrapper();
    const notificationTitle = wrapper.find('.notification-card__content__details__title');

    expect(notificationTitle.text()).toBe('Channel Settlement');
  });

  test('displays notification description', () => {
    const wrapper = createWrapper();
    const { wrappers } = wrapper
      .find('.notification-card__content__details__description')
      .findAll('p');
    const notificationDescriptionArray = wrappers.map((phrase) => phrase.text());

    // The address appears twice and we therefore need to filter one
    // out before joining the description to a string. It seems like
    // findAll picks up the address once for the p and once for the
    // address display component.
    const notificationDescriptionText = notificationDescriptionArray
      .filter((phrase, index) => notificationDescriptionArray.indexOf(phrase) === index)
      .join(' ');

    expect(notificationDescriptionText).toContain('Channel with 0x09...6789 was settled.');
  });

  test('displays block count progress if supported by notification ', () => {
    const wrapper = createWrapper();
    const notificationBlockCount = wrapper.find(
      '.notification-card__content__details__block-count',
    );

    expect(notificationBlockCount.text()).toContain('23');
    expect(notificationBlockCount.text()).toContain('notifications.block-count-progress');
  });

  test('displays link if link is in notification', () => {
    const wrapper = createWrapper();
    const notificationLink = wrapper.find('.notification-card__content__details__link');

    expect(notificationLink.text()).toContain('Visit the Withdrawal menu');
  });

  test('clicking link in notification routes user', () => {
    const wrapper = createWrapper();
    const notificationLink = wrapper.find('.notification-card__content__details__link');

    notificationLink.trigger('click');

    expect($router.push).toHaveBeenCalledTimes(1);
    expect($router.push).toHaveBeenCalledWith(
      expect.objectContaining({ name: RouteNames.ACCOUNT_WITHDRAWAL }),
    );
  });

  test('displays correctly formatted date', () => {
    const wrapper = createWrapper();
    const notificationReceived = wrapper.find('.notification-card__content__details__received');

    expect(notificationReceived.text()).toBe('6/5/1986 12:00:00 AM');
  });

  test('clicking "trash"-icon calls method for deleting notification', async () => {
    const wrapper = createWrapper();
    const deleteNotificationButton = wrapper.find('button');
    deleteNotificationButton.trigger('click');
    await wrapper.vm.$nextTick();

    expect(notificationDelete).toHaveBeenCalledTimes(1);
  });
});
