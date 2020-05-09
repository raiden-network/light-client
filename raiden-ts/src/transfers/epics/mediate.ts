import { Zero } from 'ethers/constants';
import { Observable } from 'rxjs';
import { filter, map, withLatestFrom } from 'rxjs/operators';

import { Capabilities } from '../../constants';
import { RaidenAction } from '../../actions';
import { RaidenState } from '../../state';
import { RaidenEpicDeps } from '../../types';
import { Int } from '../../utils/types';
import { transfer, transferSigned } from '../actions';
import { Direction } from '../state';

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
 * @returns Observable of outbound transfer.request actions
 */
export const transferMediateEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { address, latest$ }: RaidenEpicDeps,
) =>
  action$.pipe(
    filter(transferSigned.is),
    // filter for received transfers not to us
    filter(
      (action) =>
        action.meta.direction === Direction.RECEIVED && action.payload.message.target !== address,
    ),
    withLatestFrom(state$, latest$),
    // filter when mediating is enabled and outgoing transfer isn't set
    filter(
      ([action, { sent }, { caps }]) =>
        !caps[Capabilities.NO_MEDIATE] && !(action.meta.secrethash in sent),
    ),
    map(([{ payload: { message: transf }, meta: { secrethash } }]) =>
      // request an outbound transfer to target
      transfer.request(
        {
          tokenNetwork: transf.token_network_address,
          target: transf.target,
          value: transf.lock.amount, // TODO: implement fees
          paymentId: transf.payment_identifier,
          paths: transf.metadata.routes.map(({ route }) => ({
            path: route.slice(1), // TODO: validate we were the first/next hop
            fee: Zero as Int<32>, // TODO: implement fees
          })),
          expiration: transf.lock.expiration.toNumber(),
          initiator: transf.initiator,
        },
        { secrethash, direction: Direction.SENT },
      ),
    ),
  );
