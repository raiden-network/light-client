import type { Route } from 'vue-router';

import { routes as routeConfigs } from '@/router/routes';

/**
 * @param routeList - List of routes
 * @returns Routes mapping
 */
export function transformRouteConfigsToRoutes(routeList = routeConfigs): { [key: string]: Route } {
  const routes: { [key: string]: Route } = {};

  routeList.forEach((routeConfig) => {
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

    if (routeConfig.children) {
      const childRoutes = transformRouteConfigsToRoutes(routeConfig.children);

      Object.values(childRoutes).forEach((childRoute) => {
        routes[childRoute.name!] = {
          ...childRoute,
          path: `${routeConfig.path}/${childRoute.path}`,
        };
      });
    }
  });

  return routes;
}
