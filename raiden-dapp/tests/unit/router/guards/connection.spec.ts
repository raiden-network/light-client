import store from '@/store';
import { RouteNames } from '@/router/route-names';
import { redirectIfNotConnected } from '@/router/guards/connection';
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
  // TODO: Properly mock the global store object (getters are read-only protected)
  //
  // The idea here is that the `isConnected` getter depends on the loading state
  // and the account address. So it sets loading completed and then toggles the
  // account to be either empty or not. As result, the connection state
  // switches.
  // An issue is, that the loading state is not re-settable with mutations.
  beforeAll(() => {
    store.commit('loadComplete');
  });

  afterEach(() => {
    store.commit('account', '');
  });

  function connect(): void {
    store.commit('account', 'not-empty');
  }

  test('redirect to home route if not connected', () => {
    expect(store.getters.isConnected).toBe(false);

    Object.values(protectedRoutes).forEach((route) => {
      expect(redirectIfNotConnected(route)).toEqual(
        expect.objectContaining({ name: RouteNames.HOME })
      );
    });
  });

  test('add redirect query parameter to original target when redirecting to home route', () => {
    expect(store.getters.isConnected).toBe(false);

    Object.values(protectedRoutes).forEach((route) => {
      expect(redirectIfNotConnected(route)).toEqual(
        expect.objectContaining({ query: { redirectTo: route.fullPath } })
      );
    });
  });

  test('continue navigation if not connected, but navigate to home route already', () => {
    expect(store.getters.isConnected).toBe(false);

    expect(redirectIfNotConnected(homeRoute)).toBeNull();
  });

  test('skip home route if already connected', () => {
    connect();
    expect(store.getters.isConnected).toBe(true);

    expect(redirectIfNotConnected(homeRoute)).toEqual({
      name: RouteNames.TRANSFER,
    });
  });

  test('do nothing if connected and not navigating to home route', () => {
    connect();
    expect(store.getters.isConnected).toBe(true);

    Object.values(protectedRoutes).forEach((route) => {
      expect(redirectIfNotConnected(route)).toBeUndefined();
    });
  });

  test('do nothing if not connected and navigating to any account route', () => {
    expect(store.getters.isConnected).toBe(false);

    Object.values(accountRoutes).forEach((route) => {
      expect(redirectIfNotConnected(route)).toBeUndefined();
    });
  });
});
