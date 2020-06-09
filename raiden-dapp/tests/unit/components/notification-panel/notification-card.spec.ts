import { mount, Wrapper } from '@vue/test-utils';
import { TestData } from '../../data/mock-data';
import Vue from 'vue';
import Vuetify from 'vuetify';
import Filters from '@/filters';
import NotificationCard from '@/components/notification-panel/NotificationCard.vue';

Vue.use(Vuetify);
Vue.filter('formatDate', Filters.formatDate);

describe('NotificationCard.vue', () => {
  let wrapper: Wrapper<NotificationCard>;
  let vuetify: typeof Vuetify;

  beforeEach(() => {
    vuetify = new Vuetify();
    wrapper = mount(NotificationCard, {
      vuetify,
      propsData: { notification: TestData.notifications }
    });
  });

  test('displays notification title', () => {
    const notificationTitle = wrapper.find(
      '.notification-card__content__details__header--title'
    );

    expect(notificationTitle.text()).toBe('BALANCE PROOF SUBMITTED');
  });

  test('displays notification description', () => {
    const notificationDescription = wrapper.find(
      '.notification-card__content__details__description'
    );

    expect(notificationDescription.text()).toContain(
      'The monitoring service has submitted a balance proof'
    );
  });

  test('displays correctly formatted date', () => {
    const notificationReceived = wrapper.find(
      '.notification-card__content__details--received'
    );

    expect(notificationReceived.text()).toBe('6/5/1986 12:00:00 AM');
  });

  test('clicking "x"-icon calls method for deleting notification', async () => {
    (wrapper.vm as any).deleteNotification = jest.fn();
    const deleteNotificationButton = wrapper.find('button');
    deleteNotificationButton.trigger('click');
    await wrapper.vm.$nextTick();

    expect((wrapper.vm as any).deleteNotification).toHaveBeenCalledTimes(1);
    expect((wrapper.vm as any).deleteNotification).toHaveBeenCalledWith(
      TestData.notifications.id
    );
  });
});
