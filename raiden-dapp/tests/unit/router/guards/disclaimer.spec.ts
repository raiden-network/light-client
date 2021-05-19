import { createLocalVue } from '@vue/test-utils';
import Vuex, { Store } from 'vuex';

import { redirectIfDisclaimerIsNotAccepted } from '@/router/guards/disclaimer';
import { RouteNames } from '@/router/route-names';
import type { CombinedStoreState } from '@/store';

import { transformRouteConfigsToRoutes } from '../../utils/router-utils';

const localVue = createLocalVue();
localVue.use(Vuex);

const { [RouteNames.DISCLAIMER]: disclaimerRoute, ...routesWithoutDisclaimer } =
  transformRouteConfigsToRoutes();

function createStore(options?: { disclaimerAccepted?: boolean }): Store<CombinedStoreState> {
  const state = {
    disclaimerAccepted: options?.disclaimerAccepted ?? false,
  };

  return new Store({ state }) as Store<CombinedStoreState>;
}

describe('redirectIfDisclaimerIsNotAccepted()', () => {
  test('redirect to disclaimer route if disclaimer is not accepted', () => {
    const store = createStore({ disclaimerAccepted: false });

    Object.values(routesWithoutDisclaimer).forEach((route) => {
      expect(redirectIfDisclaimerIsNotAccepted(route, store)).toEqual(
        expect.objectContaining({ name: RouteNames.DISCLAIMER }),
      );
    });
  });

  test('add redirect query parameter to original target when redirecting to disclaimer route', () => {
    const store = createStore({ disclaimerAccepted: false });

    Object.values(routesWithoutDisclaimer).forEach((route) => {
      expect(redirectIfDisclaimerIsNotAccepted(route, store)).toEqual(
        expect.objectContaining({ query: { redirectTo: route.fullPath } }),
      );
    });
  });

  test('continue navigation if disclaimer is not accepted, but navigate to disclaimer route already', () => {
    const store = createStore({ disclaimerAccepted: false });

    expect(redirectIfDisclaimerIsNotAccepted(disclaimerRoute, store)).toBeNull();
  });

  test('skip disclaimer route if disclaimer is accepted', () => {
    const store = createStore({ disclaimerAccepted: true });

    expect(redirectIfDisclaimerIsNotAccepted(disclaimerRoute, store)).toEqual({
      name: RouteNames.HOME,
    });
  });

  test('do nothing if disclaimer is accepted and not navigating to disclaimer route', () => {
    const store = createStore({ disclaimerAccepted: true });

    Object.values(routesWithoutDisclaimer).forEach((route) => {
      expect(redirectIfDisclaimerIsNotAccepted(route, store)).toBeUndefined();
    });
  });
});
