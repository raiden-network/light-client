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
      expect(redirectIfDisclaimerIsNotAccepted(route)).toEqual(
        expect.objectContaining({ name: RouteNames.DISCLAIMER })
      );
    });
  });

  test('add redirect query parameter to original target when redirecting to disclaimer route', () => {
    expect(store.state.disclaimerAccepted).toBe(false);

    Object.values(routesWithoutDisclaimer).forEach((route) => {
      expect(redirectIfDisclaimerIsNotAccepted(route)).toEqual(
        expect.objectContaining({ query: { redirectTo: route.fullPath } })
      );
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

  // test('define redirect query when  causes redirect', async () => {
  //   const guardArguments: GuardArguments = [otherRoute, anyRoute, next];
  //   globalNavigationGuard.apply(
  //     { children: [firstChildGuard] },
  //     guardArguments
  //   );
  //   expect(next).toHaveBeenCalledWith({
  //     name: 'first-route',
  //     query: { redirectTo: '/other-path' }
  //   });
  // });
});
