import omit from 'lodash/omit';
import pick from 'lodash/pick';
import type { Observable } from 'rxjs';
import { EMPTY, from, identity, merge, of } from 'rxjs';
import {
  catchError,
  debounceTime,
  filter,
  first,
  groupBy,
  map,
  mergeMap,
  mergeMapTo,
  pluck,
  startWith,
  take,
  takeUntil,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import { Capabilities } from '../../constants';
import { pathFind } from '../../services/actions';
import type { RaidenState } from '../../state';
import { matrixPresence } from '../../transport/actions';
import { getCap } from '../../transport/utils';
import type { RaidenEpicDeps } from '../../types';
import {
  completeWith,
  dispatchRequestAndGetResponse,
  distinctRecordValues,
  pluckDistinct,
} from '../../utils/rx';
import type { Hash } from '../../utils/types';
import { untime } from '../../utils/types';
import {
  transfer,
  transferClear,
  transferExpire,
  transferSecret,
  transferSecretRequest,
  transferSecretReveal,
  transferSigned,
  transferUnlock,
} from '../actions';
import { Direction } from '../state';
import { metadataFromPaths, transferKey } from '../utils';

/**
 * Re-queue pending transfer's BalanceProof/Envelope messages for retry on init
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of transferSigned|transferUnlock.success actions
 */
export function initQueuePendingEnvelopeMessagesEpic(
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
) {
  return state$.pipe(
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
}

/**
 * Re-queue pending Received transfer's
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.config$ - Config observable
 * @returns Observable of transferSigned|transferUnlock.success actions
 */
export function initQueuePendingReceivedEpic(
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { config$ }: RaidenEpicDeps,
) {
  return state$.pipe(
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
              pluck('caps'),
              filter((caps) => !!getCap(caps, Capabilities.RECEIVE)),
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
}

/**
 * @param action$ - Observable of unresolved transfer.request actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependenceis
 * @param deps.config$ - Config observable
 * @returns Observable of pathFind.request and resolved transfer.request actions
 */
export function transferRequestResolveEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { config$ }: RaidenEpicDeps,
) {
  return action$.pipe(
    dispatchRequestAndGetResponse(pathFind, (dispatch) =>
      action$.pipe(
        filter(transfer.request.is),
        filter(
          (action): action is transfer.request & { payload: { resolved: false } } =>
            !action.payload.resolved,
        ),
        mergeMap((action) =>
          dispatch(
            pathFind.request(
              pick(action.payload, ['paths', 'pfs'] as const),
              pick(action.payload, ['tokenNetwork', 'target', 'value'] as const),
            ),
          ).pipe(
            withLatestFrom(
              action$.pipe(
                filter(matrixPresence.success.is),
                filter((a) => a.meta.address === action.payload.target),
              ),
              config$,
            ),
            map(([route, targetPresence, { encryptSecret }]) => {
              let encryptSecretOptions;
              if ((action.payload.encryptSecret ?? encryptSecret) && action.payload.secret)
                encryptSecretOptions = {
                  secret: action.payload.secret,
                  amount: action.payload.value,
                  payment_identifier: action.payload.paymentId,
                };
              const resolvedPayload = metadataFromPaths(
                route.payload.paths,
                targetPresence,
                encryptSecretOptions,
              );
              const restPayload = omit(action.payload, ['paths', 'pfs', 'encryptSecret'] as const);
              const requestOptions = { ...restPayload, ...resolvedPayload };
              return transfer.request(requestOptions, action.meta);
            }),
            catchError((err) => of(transfer.failure(err, action.meta))),
          ),
        ),
      ),
    ),
  );
}

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
export function transferClearCompletedEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { config$ }: RaidenEpicDeps,
): Observable<transferClear> {
  return state$.pipe(
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
            startWith({ meta: pick(transfer, ['secrethash', 'direction'] as const) }),
          ),
        ),
        completeWith(action$),
        // after some time with no action for this transfer going through (e.g. Processed retries)
        debounceTime(3 * httpTimeout),
        map(({ meta }) => transferClear(undefined, meta)), // clear transfer
        takeUntil(state$.pipe(filter(({ transfers }) => !(grouped$.key in transfers)))),
      ),
    ),
  );
}
