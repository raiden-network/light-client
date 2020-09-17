import { Route } from 'vue-router';
import { RouteNames } from '../route-names';
import { NavigationGuardNextArgument } from './types';
import store from '@/store';

export function redirectIfNotConnected(
  to: Route
): NavigationGuardNextArgument | undefined {
  const { isConnected } = store.getters;
  const routingToHome = to.name === RouteNames.HOME;

  if (!isConnected && !routingToHome)
    return { name: RouteNames.HOME };

  if (!isConnected && routingToHome) return null;

  if (isConnected && routingToHome) return { name: RouteNames.TRANSFER };
}
