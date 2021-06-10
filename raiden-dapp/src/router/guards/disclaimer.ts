import { RouteNames } from '../route-names';
import type { NavigationGuardChild } from './types';

export const redirectIfDisclaimerIsNotAccepted: NavigationGuardChild = (to, store) => {
  const { disclaimerAccepted } = store.state;
  const routingToDisclaimer = to.name === RouteNames.DISCLAIMER;

  if (!disclaimerAccepted && !routingToDisclaimer)
    return { name: RouteNames.DISCLAIMER, query: { redirectTo: to.fullPath } };

  if (!disclaimerAccepted && routingToDisclaimer) return null;

  if (disclaimerAccepted && routingToDisclaimer) return { name: RouteNames.HOME };
};
