import store from '@/store';
import { RouteNames } from '@/router/route-names';
import { redirectIfDisclaimerIsNotAccepted } from '@/router/guards/disclaimer';
import { transformRouteConfigsToRoutes } from '../../utils/router-utils';

const {
  [RouteNames.DISCLAIMER]: disclaimerRoute,
  ...routesWithoutDisclaimer
} = transformRouteConfigsToRoutes();

function acceptDisclaimer() {
  store.commit('acceptDisclaimer', true);
}

describe('redirectIfDisclaimerIsNotAccepted()', () => {
  test('redirect to disclaimer route if disclaimer is not accepted', () => {
    expect(store.state.disclaimerAccepted).toBe(false);

    Object.values(routesWithoutDisclaimer).forEach((route) => {
      expect(redirectIfDisclaimerIsNotAccepted(route)).toEqual({
        name: RouteNames.DISCLAIMER
      });
    });
  });

  test('continue navigation if disclaimer is not accepted, but navigate to disclaimer route already', () => {
    expect(store.state.disclaimerAccepted).toBe(false);

    expect(redirectIfDisclaimerIsNotAccepted(disclaimerRoute)).toBeNull();
  });

  test('skip disclaimer route if disclaimer is accepted', () => {
    acceptDisclaimer();

    expect(redirectIfDisclaimerIsNotAccepted(disclaimerRoute)).toEqual({
      name: RouteNames.HOME,
    });
  });

  test('do nothing if disclaimer is accepted and not navigating to disclaimer route', () => {
    acceptDisclaimer();

    Object.values(routesWithoutDisclaimer).forEach((route) => {
      expect(redirectIfDisclaimerIsNotAccepted(route)).toBeUndefined();
    });
  });
});
