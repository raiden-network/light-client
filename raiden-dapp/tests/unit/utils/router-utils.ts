import { Route } from 'vue-router';
import { routes as routeConfigs } from '@/router/routes';

export function transformRouteConfigsToRoutes(): { [key: string]: Route } {
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
