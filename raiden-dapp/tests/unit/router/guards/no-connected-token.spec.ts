import { createLocalVue } from '@vue/test-utils';
import Vuex, { Store } from 'vuex';

import { redirectIfNoConnectedToken } from '@/router/guards/no-connected-token';
import { RouteNames } from '@/router/route-names';
import type { CombinedStoreState } from '@/store';

import { transformRouteConfigsToRoutes } from '../../utils/router-utils';

const localVue = createLocalVue();
localVue.use(Vuex);

const {
  [RouteNames.NO_CONNECTED_TOKEN]: noConnectedTokenRoute,
  [RouteNames.ACCOUNT_ROOT]: accountRootRoute,
  [RouteNames.ACCOUNT_BACKUP]: accountBackupRoute,
  [RouteNames.ACCOUNT_RAIDEN]: accountRaidenRoute,
  [RouteNames.ACCOUNT_SETTINGS]: accountSettingsRoute,
  [RouteNames.ACCOUNT_WITHDRAWAL]: accountWithdrawalRoute,
  [RouteNames.ACCOUNT_UDC]: accountUdcRoute,
  [RouteNames.SELECT_TOKEN]: selectTokenRoute,
  [RouteNames.SELECT_HUB]: selectHubRoute,
  [RouteNames.OPEN_CHANNEL]: openChannelRoute,
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

const connectTokenRoutes = [selectTokenRoute, selectHubRoute, openChannelRoute];

const tokens = {
  '0xtoken': {
    '0xpartner': 1, // just something...
  },
};

function createStore(options?: { hasConnectedToken?: boolean }): Store<CombinedStoreState> {
  const getters = {
    tokensWithChannels: () => (options?.hasConnectedToken ? tokens : {}),
  };

  return new Store({ getters }) as Store<CombinedStoreState>;
}

describe('redirectIfNoConnectedToken()', () => {
  test('redirect to no connected token route if no tokens is connected', () => {
    const store = createStore({ hasConnectedToken: false });

    Object.values(protectedRoutes).forEach((route) => {
      expect(redirectIfNoConnectedToken(route, store)).toEqual(
        expect.objectContaining({ name: RouteNames.NO_CONNECTED_TOKEN }),
      );
    });
  });

  test('always continue navigation if navigate to token connection related route', () => {
    const store = createStore();

    Object.values(connectTokenRoutes).forEach((route) => {
      expect(redirectIfNoConnectedToken(route, store)).toBeNull();
    });
  });

  test('continue navigation if no token is connected, but navigate to no connected token route already', () => {
    const store = createStore({ hasConnectedToken: false });

    expect(redirectIfNoConnectedToken(noConnectedTokenRoute, store)).toBeNull();
  });

  test('skip no connected token route if there is a connected token', () => {
    const store = createStore({ hasConnectedToken: true });

    expect(redirectIfNoConnectedToken(noConnectedTokenRoute, store)).toEqual({
      name: RouteNames.TRANSFER,
    });
  });

  test('do nothing if there is a connected token and not navigating to no connected token route', () => {
    const store = createStore({ hasConnectedToken: true });

    Object.values(protectedRoutes).forEach((route) => {
      expect(redirectIfNoConnectedToken(route, store)).toBeUndefined();
    });
  });

  test('do nothing if navigating to any account related route', () => {
    const store = createStore({ hasConnectedToken: false });

    Object.values(accountRoutes).forEach((route) => {
      expect(redirectIfNoConnectedToken(route, store)).toBeUndefined();
    });
  });
});
