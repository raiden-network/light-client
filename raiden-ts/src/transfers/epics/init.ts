import { from, Observable, merge, of, EMPTY, identity } from 'rxjs';
import {
  filter,
  mergeMap,
  pluck,
  take,
  mergeMapTo,
  first,
  groupBy,
  withLatestFrom,
  debounceTime,
  map,
  startWith,
  takeUntil,
} from 'rxjs/operators';
import pick from 'lodash/fp/pick';

import { Capabilities } from '../../constants';
import { RaidenAction } from '../../actions';
import { RaidenState } from '../../state';
import { RaidenEpicDeps } from '../../types';
import { matrixPresence } from '../../transport/actions';
import { Hash, untime } from '../../utils/types';
import { distinctRecordValues, pluckDistinct } from '../../utils/rx';
import {
  transferExpire,
  transferSigned,
  transferUnlock,
  transferSecretRequest,
  transferSecretReveal,
  transferSecret,
  transferClear,
} from '../actions';
import { Direction } from '../state';
import { transferKey } from '../utils';

/**
 * Re-queue pending transfer's BalanceProof/Envelope messages for retry on init
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of transferSigned|transferUnlock.success actions
 */
export const initQueuePendingEnvelopeMessagesEpic = (
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
) =>
  state$.pipe(
    first(),
    mergeMap(({ transfers }) =>
      from(
        Object.values(transfers).filter(
          (r) =>
            r.direction === Direction.SENT &&
            !r.unlockProcessed &&
            !r.expiredProcessed &&
            !r.secretRegistered &&
            !r.channelClosed,
        ),
      ),
    ),
    mergeMap(function* (transferState) {
      // loop over all pending transfers
      const meta = {
        secrethash: transferState.transfer.lock.secrethash,
        direction: Direction.SENT,
      };
      // on init, request monitor presence of any pending transfer target
      yield matrixPresence.request(undefined, { address: transferState.transfer.target });
      // Processed not received yet for LockedTransfer
      if (!transferState.transferProcessed)
        yield transferSigned(
          {
            message: untime(transferState.transfer),
            fee: transferState.fee,
            partner: transferState.partner,
          },
          meta,
        );
      // already unlocked, but Processed not received yet for Unlock
      if (transferState.unlock)
        yield transferUnlock.success(
          { message: untime(transferState.unlock), partner: transferState.partner },
          meta,
        );
      // lock expired, but Processed not received yet for LockExpired
      if (transferState.expired)
        yield transferExpire.success(
          { message: untime(transferState.expired), partner: transferState.partner },
          meta,
        );
    }),
  );

/**
 * Re-queue pending Received transfer's
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.config$ - Config observable
 * @returns Observable of transferSigned|transferUnlock.success actions
 */
export const initQueuePendingReceivedEpic = (
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { config$ }: RaidenEpicDeps,
) =>
  state$.pipe(
    first(),
    mergeMap(({ transfers }) =>
      from(
        Object.values(transfers).filter(
          (r) =>
            r.direction === Direction.RECEIVED &&
            !r.unlock &&
            !r.expired &&
            !r.secretRegistered &&
            !r.channelClosed,
        ),
      ),
    ),
    mergeMap((transferState) => {
      // loop over all pending transfers
      const secrethash = transferState.transfer.lock.secrethash;
      const meta = { secrethash, direction: Direction.RECEIVED };
      return merge(
        // on init, request monitor presence of any pending transfer initiator
        of(
          transferSigned(
            {
              message: untime(transferState.transfer),
              fee: transferState.fee,
              partner: transferState.partner,
            },
            meta,
          ),
        ),
        // already revealed to us, but user didn't sign SecretReveal yet
        transferState.secret && !transferState.secretReveal
          ? of(transferSecret({ secret: transferState.secret }, meta))
          : EMPTY,
        // already revealed to sender, but they didn't Unlock yet
        transferState.secretReveal
          ? of(transferSecretReveal({ message: untime(transferState.secretReveal) }, meta))
          : EMPTY,
        // secret not yet known; request *when* receiving is enabled (may be later)
        // secretRequest should always be defined as we sign it when receiving transfer
        !transferState.secret && transferState.secretRequest
          ? config$.pipe(
              pluck('caps', Capabilities.NO_RECEIVE),
              filter((noReceive) => !noReceive),
              take(1),
              mergeMapTo(
                of(
                  matrixPresence.request(undefined, { address: transferState.transfer.initiator }),
                  transferSecretRequest({ message: untime(transferState.secretRequest) }, meta),
                ),
              ),
            )
          : EMPTY,
      );
    }),
  );

function hasTransferMeta(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: any,
): action is { meta: { secrethash: Hash; direction: Direction } } {
  return 'meta' in action && action.meta?.secrethash && action.meta?.direction;
}

/**
 * Clear transfer from state after it's completed and some timeout of inactivity
 * It should still get saved (by persister) on database, but is freed from memory.
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.config$ - Config observable
 * @returns Observable of transferClear actions
 */
export const transferClearCompletedEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { config$ }: RaidenEpicDeps,
): Observable<transferClear> =>
  state$.pipe(
    pluckDistinct('transfers'),
    distinctRecordValues(),
    groupBy(
      ([key]) => key, // group per transfer
      identity,
      // cleanup when transfer is cleared
      (grouped$) => state$.pipe(filter(({ transfers }) => !(grouped$.key in transfers))),
    ),
    withLatestFrom(config$),
    mergeMap(([grouped$, { httpTimeout }]) =>
      grouped$.pipe(
        // when transfer completes or there's nothing else to do with it
        filter(
          ([, transfer]) =>
            !!(transfer.unlockProcessed || transfer.expiredProcessed || transfer.channelSettled),
        ),
        take(1),
        mergeMap(([, transfer]) =>
          action$.pipe(
            filter(hasTransferMeta),
            filter((action) => transferKey(action.meta) === grouped$.key),
            startWith({ meta: pick(['secrethash', 'direction'], transfer) }),
          ),
        ),
        // after some time with no action for this transfer going through (e.g. Processed retries)
        debounceTime(3 * httpTimeout),
        map(({ meta }) => transferClear(undefined, meta)), // clear transfer
        takeUntil(state$.pipe(filter(({ transfers }) => !(grouped$.key in transfers)))),
      ),
    ),
  );
