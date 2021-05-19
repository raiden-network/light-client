import { RouteNames } from '../route-names';
import type { NavigationGuardChild } from './types';

const accountRoutes = [
  RouteNames.ACCOUNT_ROOT,
  RouteNames.ACCOUNT_BACKUP,
  RouteNames.ACCOUNT_RAIDEN,
  RouteNames.ACCOUNT_SETTINGS,
  RouteNames.ACCOUNT_WITHDRAWAL,
  RouteNames.ACCOUNT_UDC,
] as string[];

export const redirectIfNotConnected: NavigationGuardChild = (to, store) => {
  const { isConnected } = store.state;
  const routingToAccount = accountRoutes.includes(to.name ?? '');
  const routingToHome = to.name === RouteNames.HOME;

  if (routingToAccount) return undefined;

  if (!isConnected && !routingToHome)
    return { name: RouteNames.HOME, query: { redirectTo: to.fullPath } };

  if (!isConnected && routingToHome) return null;

  if (isConnected && routingToHome) return { name: RouteNames.TRANSFER };
};
