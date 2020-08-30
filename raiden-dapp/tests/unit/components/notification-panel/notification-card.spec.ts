import { mount, Wrapper } from '@vue/test-utils';
import { TestData } from '../../data/mock-data';
import Vue from 'vue';
import Vuetify from 'vuetify';
import Filters from '@/filters';
import NotificationCard from '@/components/notification-panel/NotificationCard.vue';
import store from '@/store';

Vue.use(Vuetify);
Vue.filter('formatDate', Filters.formatDate);

describe('NotificationCard.vue', () => {
  let wrapper: Wrapper<NotificationCard>;
  let vuetify: typeof Vuetify;

  beforeEach(() => {
    vuetify = new Vuetify();
    wrapper = mount(NotificationCard, {
      vuetify,
      store,
      mocks: {
        $t: (msg: string) => msg,
      },
      propsData: { notification: TestData.notifications },
    });
  });

  test('displays notification title', () => {
    const notificationTitle = wrapper.find(
      '.notification-card__content__details__title'
    );

    expect(notificationTitle.text()).toBe('Channel Settlement');
  });

  test('displays notification description', () => {
    const { wrappers } = wrapper
      .find('.notification-card__content__details__description')
      .findAll('p');
    const notificationDescriptionArray = wrappers.map((phrase) =>
      phrase.text()
    );

    // The address appears twice and we therefore need to filter one
    // out before joining the description to a string. It seems like
    // findAll picks up the address once for the p and once for the
    // address display component.
    const notificationDescriptionText = notificationDescriptionArray
      .filter(
        (phrase, index) =>
          notificationDescriptionArray.indexOf(phrase) === index
      )
      .join(' ');

    expect(notificationDescriptionText).toContain(
      'Channel with 0x09...6789 was settled.'
    );
  });

  test('displays correctly formatted date', () => {
    const notificationReceived = wrapper.find(
      '.notification-card__content__details__received'
    );

    expect(notificationReceived.text()).toBe('6/5/1986 12:00:00 AM');
  });

  test('clicking "trash"-icon calls method for deleting notification', async () => {
    await store.dispatch('notifications/notify', TestData.notifications);
    const deleteNotificationButton = wrapper.find('button');
    deleteNotificationButton.trigger('click');
    await wrapper.vm.$nextTick();

    // @ts-ignore
    expect(store.state.notifications.notifications).toHaveLength(0);
  });
});
