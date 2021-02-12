import type { NavigationGuardNext, Route } from 'vue-router';

import { beforeRouteToAccount } from '@/router/guards/account';
import { RouteNames } from '@/router/route-names';

import { transformRouteConfigsToRoutes } from '../../utils/router-utils';

const {
  [RouteNames.ACCOUNT_ROOT]: accountRoute,
  ...routesWithoutAccount
} = transformRouteConfigsToRoutes();

const next: NavigationGuardNext = jest.fn();

describe('beforeRouteToAccount', () => {
  test('redirect to home route when accessing account route directly', () => {
    beforeRouteToAccount(accountRoute, { name: null } as Route, next);
    expect(next).toHaveBeenCalledWith({ name: RouteNames.HOME });
  });

  test('set from route as parent when navigating to notifications route', () => {
    // TODO: Test actual component replacement
    Object.values(routesWithoutAccount).forEach((route) => {
      beforeRouteToAccount(accountRoute, route, next);
      expect(next).toHaveBeenCalledWith();
    });
  });
});
