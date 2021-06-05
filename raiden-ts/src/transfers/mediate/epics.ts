import type { Observable } from 'rxjs';
import { filter, map, withLatestFrom } from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import { ChannelState } from '../../channels/state';
import { channelKey } from '../../channels/utils';
import type { RaidenConfig } from '../../config';
import { Capabilities } from '../../constants';
import type { RouteMetadata } from '../../messages/types';
import type { RaidenState } from '../../state';
import { getCap } from '../../transport/utils';
import type { RaidenEpicDeps } from '../../types';
import type { Address, Int } from '../../utils/types';
import { isntNil } from '../../utils/types';
import { transfer, transferSigned } from '../actions';
import { Direction } from '../state';
import { transferKey } from '../utils';

function shouldMediate(action: transferSigned, address: Address, { caps }: RaidenConfig): boolean {
  const isMediationEnabled = getCap(caps, Capabilities.MEDIATE);
  const isntTarget =
    action.meta.direction === Direction.RECEIVED && action.payload.message.target !== address;

  return !!isMediationEnabled && isntTarget;
}

/**
 * A valid route is one with a partner with which we have an open channel, and we're either in the
 * route (and partner is next hop) or the first hop is our partner (we received a clean route);
 * we return a clean set of routes where all of them go through the same partner, since we need to
 * know the outbound channel in order to calculate the mediation fees.
 *
 * @param routes - RouteMetadata array containing the received routes
 * @param state - Current state (to check for open channels)
 * @param tokenNetwork - Transfer's TokenNetwork address
 * @param deps - Epics dependencies subset
 * @param deps.address - Our address
 * @param deps.log - Logger instance
 * @returns Filtered and cleaned routes array, or undefined if no valid route was found
 */
function filterAndCleanValidRoutes(
  routes: readonly RouteMetadata[],
  state: RaidenState,
  tokenNetwork: Address,
  { address, log }: Pick<RaidenEpicDeps, 'address' | 'log'>,
) {
  const allPartnersWithOpenChannels = new Set(
    Object.values(state.channels)
      .filter((channel) => channel.tokenNetwork === tokenNetwork)
      .filter((channel) => channel.state === ChannelState.open)
      .map(({ partner }) => partner.address),
  );

  function clearRoute(metadata: RouteMetadata) {
    let route = metadata.route;
    const ourIndex = route.findIndex((hop) => hop === address);
    // if we're in the path (front or mid), forward only remaining path, starting with partner/next hop
    if (ourIndex >= 0) route = route.slice(ourIndex + 1);
    // next hop must be our partner, otherwise return null to drop this route
    if (!allPartnersWithOpenChannels.has(route[0])) return null;
    return { ...metadata, route };
  }
  let result = routes.map(clearRoute).filter(isntNil);

  const outPartner = result[0]?.route[0];
  if (!outPartner) {
    log.warn('Mediation: could not find a suitable route, ignoring', {
      inputRoutes: routes,
      openPartners: allPartnersWithOpenChannels,
    });
    return;
  }
  // filter only for routes matching first hop; in the old days of RefundTransfer,
  // we could/should retry the following partners upon receiving a refund, but now we only
  // support a single outgoing partner, and drop the others (if any)
  result = result.filter(({ route }) => route[0] === outPartner);

  return result;
}

/**
 * When receiving a transfer not targeting us, create an outgoing transfer to target
 * Mediated transfers are handled the same way as unrelated received & sent pairs. The difference
 * is that we don't request the secret (as initiator would only reveal to target), and instead,
 * wait for SecretReveal to cascade back from outbound partner, then we unlock it and reveal back
 * to inbound partner, to get its Unlock.
 * If it doesn't succeed, if we didn't get reveal, we'll accept LockExpired, if we did and know
 * the secret but partner didn't unlock, we register on-chain as usual.
 *
 * @param action$ - Observable of incoming transferSigned transfers
 * @param state$ - Observable of RaidenStates
 * @param deps - Raiden epic deps
 * @param deps.address - Our address
 * @param deps.config$ - Latest observable
 * @param deps.log - Logger instance
 * @param deps.mediationFeeCalculator - Calculator for mediating transfer's fee
 * @returns Observable of outbound transfer.request actions
 */
export function transferMediateEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { address, config$, log, mediationFeeCalculator }: RaidenEpicDeps,
) {
  return action$.pipe(
    filter(transferSigned.is),
    withLatestFrom(config$, state$),
    filter(([action, config]) => shouldMediate(action, address, config)),
    map(([action, config, state]) => {
      const receivedState = state.transfers[transferKey(action.meta)];
      const message = action.payload.message;

      const tokenNetwork = message.token_network_address;
      const secrethash = action.meta.secrethash;
      const inPartner = receivedState.partner;

      const cleanRoutes = filterAndCleanValidRoutes(message.metadata.routes, state, tokenNetwork, {
        address,
        log,
      });
      if (!cleanRoutes) return;
      const outPartner = cleanRoutes[0].route[0];

      const channelIn = state.channels[channelKey({ tokenNetwork, partner: inPartner })];
      const channelOut = state.channels[channelKey({ tokenNetwork, partner: outPartner })];

      let fee: Int<32>;
      try {
        fee = mediationFeeCalculator.fee(
          config.mediationFees,
          channelIn,
          channelOut,
        )(message.lock.amount);
      } catch (error) {
        log.warn('Mediation: could not calculate mediation fee, ignoring', { error });
        return;
      }
      // on a transfer.request, fee is *added* to the value to get final sent amount,
      // therefore here it needs to contain a negative fee, which we will "earn" instead of pay
      fee = fee.mul(-1) as Int<32>;
      const paths = cleanRoutes.map(({ route }) => ({ path: route, fee }));

      // request an outbound transfer to target; will fail if already sent
      return transfer.request(
        {
          tokenNetwork: message.token_network_address,
          target: message.target,
          paymentId: message.payment_identifier,
          value: message.lock.amount,
          paths,
          expiration: message.lock.expiration.toNumber(),
          initiator: message.initiator,
        },
        { secrethash, direction: Direction.SENT },
      );
    }),
    filter(isntNil),
  );
}
