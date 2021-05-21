import { RouteNames } from '../route-names';
import type { NavigationGuardChild } from './types';

const unprotectedAccountRoutes = [
  RouteNames.ACCOUNT_ROOT,
  RouteNames.ACCOUNT_BACKUP,
  RouteNames.ACCOUNT_SETTINGS,
] as string[];

export const redirectIfNotConnected: NavigationGuardChild = (to, store) => {
  const { isConnected } = store.state;
  const routingToFreeAccountRoute = unprotectedAccountRoutes.includes(to.name ?? '');
  const routingToHomeRoute = to.name === RouteNames.HOME;

  if (routingToFreeAccountRoute) return undefined;

  if (!isConnected && !routingToHomeRoute)
    return { name: RouteNames.HOME, query: { redirectTo: to.fullPath } };

  if (!isConnected && routingToHomeRoute) return null;

  if (isConnected && routingToHomeRoute) return { name: RouteNames.TRANSFER };
};
