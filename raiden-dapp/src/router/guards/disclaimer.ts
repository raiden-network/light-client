import { Route } from 'vue-router';
import { RouteNames } from '../route-names';
import { NavigationGuardNextArgument } from './types';
import store from '@/store';

export function redirectIfDisclaimerIsNotAccepted(
  to: Route
): NavigationGuardNextArgument | undefined {
  const { disclaimerAccepted } = store.state;
  const routingToDisclaimer = to.name === RouteNames.DISCLAIMER;

  if (!disclaimerAccepted && !routingToDisclaimer)
    return { name: RouteNames.DISCLAIMER };

  if (!disclaimerAccepted && routingToDisclaimer) return null;

  if (disclaimerAccepted && routingToDisclaimer)
    return { name: RouteNames.HOME };
}
