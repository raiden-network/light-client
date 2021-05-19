import { createLocalVue } from '@vue/test-utils';
import Vuex, { Store } from 'vuex';

import { redirectIfNotConnected } from '@/router/guards/connection';
import { RouteNames } from '@/router/route-names';
import type { CombinedStoreState } from '@/store';

import { transformRouteConfigsToRoutes } from '../../utils/router-utils';

const localVue = createLocalVue();
localVue.use(Vuex);

const {
  [RouteNames.HOME]: homeRoute,
  [RouteNames.ACCOUNT_ROOT]: accountRootRoute,
  [RouteNames.ACCOUNT_BACKUP]: accountBackupRoute,
  [RouteNames.ACCOUNT_RAIDEN]: accountRaidenRoute,
  [RouteNames.ACCOUNT_SETTINGS]: accountSettingsRoute,
  [RouteNames.ACCOUNT_WITHDRAWAL]: accountWithdrawalRoute,
  [RouteNames.ACCOUNT_UDC]: accountUdcRoute,
  ...protectedRoutes
} = transformRouteConfigsToRoutes();

const accountRoutes = [
  accountRootRoute,
  accountBackupRoute,
  accountRaidenRoute,
  accountSettingsRoute,
  accountWithdrawalRoute,
  accountUdcRoute,
];

function createStore(options?: { isConnected?: boolean }): Store<CombinedStoreState> {
  const state = {
    isConnected: options?.isConnected ?? false,
  };

  return new Store({ state }) as Store<CombinedStoreState>;
}

describe('redirectIfNotConnected()', () => {
  test('redirect to home route if not connected', () => {
    const store = createStore({ isConnected: false });

    Object.values(protectedRoutes).forEach((route) => {
      expect(redirectIfNotConnected(route, store)).toEqual(
        expect.objectContaining({ name: RouteNames.HOME }),
      );
    });
  });

  test('add redirect query parameter to original target when redirecting to home route', () => {
    const store = createStore({ isConnected: false });

    Object.values(protectedRoutes).forEach((route) => {
      expect(redirectIfNotConnected(route, store)).toEqual(
        expect.objectContaining({ query: { redirectTo: route.fullPath } }),
      );
    });
  });

  test('continue navigation if not connected, but navigate to home route already', () => {
    const store = createStore({ isConnected: false });

    expect(redirectIfNotConnected(homeRoute, store)).toBeNull();
  });

  test('skip home route if already connected', () => {
    const store = createStore({ isConnected: true });

    expect(redirectIfNotConnected(homeRoute, store)).toEqual({
      name: RouteNames.TRANSFER,
    });
  });

  test('do nothing if connected and not navigating to home route', () => {
    const store = createStore({ isConnected: true });

    Object.values(protectedRoutes).forEach((route) => {
      expect(redirectIfNotConnected(route, store)).toBeUndefined();
    });
  });

  test('do nothing if not connected and navigating to any account route', () => {
    const store = createStore({ isConnected: false });

    Object.values(accountRoutes).forEach((route) => {
      expect(redirectIfNotConnected(route, store)).toBeUndefined();
    });
  });
});
