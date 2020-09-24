import { Route } from 'vue-router';
import { RouteNames } from '../route-names';
import { NavigationGuardNextArgument } from './types';
import store from '@/store';

const accountRoutes = [
  RouteNames.ACCOUNT_ROOT,
  RouteNames.ACCOUNT_BACKUP,
  RouteNames.ACCOUNT_RAIDEN,
  RouteNames.ACCOUNT_SETTINGS,
  RouteNames.ACCOUNT_WITHDRAWAL,
  RouteNames.ACCOUNT_UDC,
] as string[];

export function redirectIfNotConnected(
  to: Route
): NavigationGuardNextArgument | undefined {
  const { isConnected } = store.getters;
  const routingToAccount = accountRoutes.includes(to.name ?? '');
  const routingToHome = to.name === RouteNames.HOME;

  if (routingToAccount) return undefined;

  if (!isConnected && !routingToHome)
    return { name: RouteNames.HOME, query: { redirectTo: to.fullPath } };

  if (!isConnected && routingToHome) return null;

  if (isConnected && routingToHome) return { name: RouteNames.TRANSFER };
}
