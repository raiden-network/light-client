import store from '@/store';
import { RouteNames } from '@/router/route-names';
import { redirectIfNotConnected } from '@/router/guards/connection';
import { transformRouteConfigsToRoutes } from '../../utils/router-utils';

const {
  [RouteNames.HOME]: homeRoute,
  ...routesWithoutHome
} = transformRouteConfigsToRoutes();

function connect() {
  store.commit('loadComplete');
  store.commit('account', 'not-empty');
}

describe('redirectIfNotConnected()', () => {
  test('redirect to home route if not connected', () => {
    expect(store.getters.isConnected).toBe(false);

    Object.values(routesWithoutHome).forEach((route) => {
      expect(redirectIfNotConnected(route)).toEqual({
        name: RouteNames.HOME
      });
    });
  });

  test('continue navigation if not connected, but navigate to home route already', () => {
    expect(store.getters.isConnected).toBe(false);

    expect(redirectIfNotConnected(homeRoute)).toBeNull();
  });

  test('skip home route if already connected', () => {
    connect();

    expect(redirectIfNotConnected(homeRoute)).toEqual({
      name: RouteNames.TRANSFER,
    });
  });

  test('do nothing if disclaimer is accepted and not navigating to disclaimer route', () => {
    connect();

    Object.values(routesWithoutHome).forEach((route) => {
      expect(redirectIfNotConnected(route)).toBeUndefined();
    });
  });
});
