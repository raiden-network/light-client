import type { NavigationGuardNext, Route } from 'vue-router';

import { beforeRouteToNotifications } from '@/router/guards/notifications';
import { RouteNames } from '@/router/route-names';

import { transformRouteConfigsToRoutes } from '../../utils/router-utils';

const { [RouteNames.NOTIFICATIONS]: notificationsRoute, ...routesWithoutNotifications } =
  transformRouteConfigsToRoutes();

const next: NavigationGuardNext = jest.fn();

describe('beforeRouteToNotifications', () => {
  test('redirect to home route when accessing notifications route directly', () => {
    beforeRouteToNotifications(notificationsRoute, { name: null } as Route, next);
    expect(next).toHaveBeenCalledWith({ name: RouteNames.HOME });
  });

  test('set from route as parent when navigating to notifications route', () => {
    // TODO: Test actual component replacement
    Object.values(routesWithoutNotifications).forEach((route) => {
      beforeRouteToNotifications(notificationsRoute, route, next);
      expect(next).toHaveBeenCalledWith();
    });
  });
});
