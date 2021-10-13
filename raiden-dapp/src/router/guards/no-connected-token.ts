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

const connectTokenRoutes = [
  RouteNames.SELECT_TOKEN,
  RouteNames.SELECT_HUB,
  RouteNames.OPEN_CHANNEL,
] as string[];

export const redirectIfNoConnectedToken: NavigationGuardChild = (to, store) => {
  const { tokensWithChannels } = store.getters;
  const noTokenWithChannel = Object.keys(tokensWithChannels).length === 0;
  const routingToNoTokens = to.name === RouteNames.NO_CONNECTED_TOKEN;
  const routingToQuickPayRoute = to.name === RouteNames.QUICK_PAY;
  const routingToAccountRoute = accountRoutes.includes(to.name ?? '');
  const routingToConnectTokenRoute = connectTokenRoutes.includes(to.name ?? '');

  if (routingToAccountRoute || routingToQuickPayRoute) return undefined;

  if (routingToConnectTokenRoute) return null;

  if (noTokenWithChannel && !routingToNoTokens) return { name: RouteNames.NO_CONNECTED_TOKEN };

  if (noTokenWithChannel && routingToNoTokens) return null;

  if (!noTokenWithChannel && routingToNoTokens) return { name: RouteNames.TRANSFER };
};
