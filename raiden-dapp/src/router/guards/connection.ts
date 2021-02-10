import type { Route } from 'vue-router';

import store from '@/store';

import { RouteNames } from '../route-names';
import type { NavigationGuardNextArgument } from './types';

const accountRoutes = [
  RouteNames.ACCOUNT_ROOT,
  RouteNames.ACCOUNT_BACKUP,
  RouteNames.ACCOUNT_RAIDEN,
  RouteNames.ACCOUNT_SETTINGS,
  RouteNames.ACCOUNT_WITHDRAWAL,
  RouteNames.ACCOUNT_UDC,
] as string[];

/**
 * @param to - navigation target
 * @returns eventual navigation instruction for middleware of global guard
 */
export function redirectIfNotConnected(to: Route): NavigationGuardNextArgument | undefined {
  const { isConnected } = store.getters;
  const routingToAccount = accountRoutes.includes(to.name ?? '');
  const routingToHome = to.name === RouteNames.HOME;

  if (routingToAccount) return undefined;

  if (!isConnected && !routingToHome)
    return { name: RouteNames.HOME, query: { redirectTo: to.fullPath } };

  if (!isConnected && routingToHome) return null;

  if (isConnected && routingToHome) return { name: RouteNames.TRANSFER };
}
