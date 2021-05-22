import type { Observable } from 'rxjs';
import { filter, map, withLatestFrom } from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import { ChannelState } from '../../channels/state';
import { channelKey } from '../../channels/utils';
import type { RaidenConfig } from '../../config';
import { Capabilities } from '../../constants';
import { validateAddressMetadata } from '../../messages/utils';
import type { RaidenState } from '../../state';
import type { Via } from '../../transport/types';
import { getCap } from '../../transport/utils';
import type { RaidenEpicDeps } from '../../types';
import type { Address, Int } from '../../utils/types';
import { isntNil } from '../../utils/types';
import { transfer, transferSigned } from '../actions';
import { Direction } from '../state';

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
 * @param received - received transferSigned
 * @param state - Current state (to check for open channels)
 * @param config - Current config
 * @param deps - Epics dependencies subset
 * @param deps.address - Our address
 * @param deps.log - Logger instance
 * @param deps.mediationFeeCalculator - Calculator for mediating transfer's fee
 * @returns Filtered and cleaned routes array, or undefined if no valid route was found
 */
function findValidPartner(
  received: transferSigned,
  state: RaidenState,
  config: RaidenConfig,
  { address, log, mediationFeeCalculator }: RaidenEpicDeps,
): Pick<transfer.request['payload'], 'partner' | 'fee' | keyof Via> | undefined {
  const message = received.payload.message;
  const inPartner = received.payload.partner;
  const tokenNetwork = message.token_network_address;
  const partnersWithOpenChannels = new Set(
    Object.values(state.channels)
      .filter((channel) => channel.tokenNetwork === tokenNetwork)
      .filter((channel) => channel.state === ChannelState.open)
      .map(({ partner }) => partner.address),
  );
  for (const { route, address_metadata } of message.metadata.routes) {
    const ourIndex = route.findIndex((hop) => hop === address);
    const outPartner = route[ourIndex + 1];
    if (!outPartner || !partnersWithOpenChannels.has(outPartner)) continue;

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

    const outPartnerMetadata = validateAddressMetadata(
      address_metadata?.[outPartner],
      outPartner,
      { log },
    );
    return { partner: outPartner, fee, userId: outPartnerMetadata?.user_id };
  }
  log.warn('Mediation: could not find a suitable route, ignoring', {
    inputRoutes: message.metadata.routes,
    openPartners: partnersWithOpenChannels,
  });
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
  deps: RaidenEpicDeps,
) {
  const { address, config$ } = deps;
  return action$.pipe(
    filter(transferSigned.is),
    withLatestFrom(config$, state$),
    filter(([action, config]) => shouldMediate(action, address, config)),
    map(([action, config, state]) => {
      const message = action.payload.message;
      const secrethash = action.meta.secrethash;

      const outVia = findValidPartner(action, state, config, deps);
      if (!outVia) return;

      // request an outbound transfer to target; will fail if already sent
      return transfer.request(
        {
          tokenNetwork: message.token_network_address,
          target: message.target,
          paymentId: message.payment_identifier,
          value: message.lock.amount,
          expiration: message.lock.expiration.toNumber(),
          initiator: message.initiator,
          metadata: message.metadata, // passthrough unchanged metadata
          ...outVia,
        },
        { secrethash, direction: Direction.SENT },
      );
    }),
    filter(isntNil),
  );
}
