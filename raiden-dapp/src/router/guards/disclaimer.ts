import type { Route } from 'vue-router';

import store from '@/store';

import { RouteNames } from '../route-names';
import type { NavigationGuardNextArgument } from './types';

/**
 * @param to - navigation target
 * @returns eventual navigation instruction for middleware of global guard
 */
export function redirectIfDisclaimerIsNotAccepted(
  to: Route,
): NavigationGuardNextArgument | undefined {
  const { disclaimerAccepted } = store.state;
  const routingToDisclaimer = to.name === RouteNames.DISCLAIMER;

  if (!disclaimerAccepted && !routingToDisclaimer)
    return { name: RouteNames.DISCLAIMER, query: { redirectTo: to.fullPath } };

  if (!disclaimerAccepted && routingToDisclaimer) return null;

  if (disclaimerAccepted && routingToDisclaimer) return { name: RouteNames.HOME };
}
