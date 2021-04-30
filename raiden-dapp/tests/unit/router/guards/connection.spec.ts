import { redirectIfNotConnected } from '@/router/guards/connection';
import { RouteNames } from '@/router/route-names';
import store from '@/store';

import { transformRouteConfigsToRoutes } from '../../utils/router-utils';

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

describe('redirectIfNotConnected()', () => {
  beforeEach(() => {
    store.commit('setDisconnected');
  });

  test('redirect to home route if not connected', () => {
    expect(store.state.isConnected).toBe(false);

    Object.values(protectedRoutes).forEach((route) => {
      expect(redirectIfNotConnected(route)).toEqual(
        expect.objectContaining({ name: RouteNames.HOME }),
      );
    });
  });

  test('add redirect query parameter to original target when redirecting to home route', () => {
    expect(store.state.isConnected).toBe(false);

    Object.values(protectedRoutes).forEach((route) => {
      expect(redirectIfNotConnected(route)).toEqual(
        expect.objectContaining({ query: { redirectTo: route.fullPath } }),
      );
    });
  });

  test('continue navigation if not connected, but navigate to home route already', () => {
    expect(store.state.isConnected).toBe(false);

    expect(redirectIfNotConnected(homeRoute)).toBeNull();
  });

  test('skip home route if already connected', () => {
    store.commit('setConnected');
    expect(store.state.isConnected).toBe(true);

    expect(redirectIfNotConnected(homeRoute)).toEqual({
      name: RouteNames.TRANSFER,
    });
  });

  test('do nothing if connected and not navigating to home route', () => {
    store.commit('setConnected');
    expect(store.state.isConnected).toBe(true);

    Object.values(protectedRoutes).forEach((route) => {
      expect(redirectIfNotConnected(route)).toBeUndefined();
    });
  });

  test('do nothing if not connected and navigating to any account route', () => {
    expect(store.state.isConnected).toBe(false);

    Object.values(accountRoutes).forEach((route) => {
      expect(redirectIfNotConnected(route)).toBeUndefined();
    });
  });
});
