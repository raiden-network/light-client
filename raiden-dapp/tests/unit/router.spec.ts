import { Route, NavigationGuardNext } from 'vue-router';
import { routes as routeConfigs, globalNavigationGuard } from '@/router';
import { RouteNames } from '@/router/route-names';
import store from '@/store';

function transformRouteConfigsToRoutes(): { [key: string]: Route } {
  const routes: { [key: string]: Route } = {};

  routeConfigs.forEach((routeConfig) => {
    if (routeConfig.name) {
      const route = {
        ...routeConfig,
        hash: '',
        query: {},
        params: {},
        fullPath: routeConfig.path,
        matched: [],
      };
      routes[routeConfig.name] = route;
    }
  });

  return routes;
}

describe('Router', () => {
  const routes = transformRouteConfigsToRoutes();
  const {
    [RouteNames.DISCLAIMER]: disclaimerRoute,
    ...routesWithoutDisclaimer
  } = routes;
  const startRoute = {
    path: '/',
    hash: '',
    query: {},
    params: {},
    fullPath: '/',
    matched: [],
  };

  let next: NavigationGuardNext;

  beforeEach(() => {
    next = jest.fn();
  });

  const acceptDisclaimer = () => {
    store.commit('acceptDisclaimer', false);
  };

  test('redirect to disclaimer router if disclaimer has not been accepted yet', async () => {
    expect(store.state.disclaimerAccepted).toBe(false);

    Object.values(routesWithoutDisclaimer).forEach((route) => {
      globalNavigationGuard(route, startRoute, next);
      expect(next).toHaveBeenCalledWith({
        name: RouteNames.DISCLAIMER,
        query: { redirectTo: route.path },
      });
      (next as jest.Mock).mockClear();
    });
  });

  test('do not redirect when navigate to disclaimer route', async () => {
    expect(store.state.disclaimerAccepted).toBe(false);

    globalNavigationGuard(disclaimerRoute, startRoute, next);

    expect(next).toHaveBeenCalledWith();
  });

  test('skip disclaimer route if disclaimer got accepted ', async () => {
    acceptDisclaimer();
    globalNavigationGuard(disclaimerRoute, startRoute, next);

    expect(next).toHaveBeenCalledWith({ name: RouteNames.HOME });
  });

  test('do not redirect when disclaimer got accepted', () => {
    acceptDisclaimer();

    Object.values(routesWithoutDisclaimer).forEach((route) => {
      globalNavigationGuard(route, startRoute, next);
      expect(next).toHaveBeenCalledWith();
      (next as jest.Mock).mockClear();
    });
  });
});
