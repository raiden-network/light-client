import type { Observable } from 'rxjs';
import { from, merge, of } from 'rxjs';
import {
  delay,
  distinctUntilKeyChanged,
  exhaustMap,
  mergeMap,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import type { RaidenState } from '../../state';
import type { RaidenEpicDeps } from '../../types';
import { isResponseOf } from '../../utils/actions';
import { ErrorCodes, RaidenError } from '../../utils/error';
import { transfer, transferExpire } from '../actions';
import { Direction } from '../state';
import { dispatchAndWait$ } from './utils';

/**
 * Process newBlocks, emits transferExpire.request (request to compose&sign LockExpired for a
 * transfer) if pending transfer's lock expired and transfer didn't unlock (succeed) in time
 * Also, emits transfer.failure, to notify users that a transfer has failed (although it'll only be
 * considered as completed with fail once the transferExpireProcessed arrives).
 *
 * @param action$ - Observable of newBlock|transferExpire.success|transferExpire.failure actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.config$ - Config observable
 * @param deps.latest$ - Latest observable
 * @returns Observable of transferExpire.request|transfer.failure actions
 */
export function transferAutoExpireEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { config$, latest$ }: RaidenEpicDeps,
): Observable<transferExpire.request | transfer.failure> {
  return state$.pipe(
    distinctUntilKeyChanged('blockNumber'),
    withLatestFrom(config$, latest$),
    // With interactive signing sending a lock expired message requires user
    // intervention. In that case it is possible for a new block to arrive
    // while waiting for the user permission, without the `exhaustMap` below
    // multiple signing requests would be emited *for the same lock*.
    // `exhaustMap` prevents that from happening, by blocking new signing
    // requests until the existing ones have been concluded.
    exhaustMap(([{ transfers }, { confirmationBlocks }, { blockTime }]) =>
      from(
        Object.values(transfers).filter(
          (r) =>
            r.direction === Direction.SENT &&
            !r.unlock &&
            !r.expired &&
            !r.secretRegistered &&
            !r.channelClosed &&
            r.expiration <= Date.now() / 1e3,
        ),
      ).pipe(
        mergeMap((doc) => {
          const meta = { secrethash: doc.transfer.lock.secrethash, direction: Direction.SENT };
          // this observable acts like a Promise: emits request once, completes on success/failure
          return merge(
            dispatchAndWait$(
              action$,
              transferExpire.request(undefined, meta),
              isResponseOf(transferExpire, meta),
            ).pipe(delay(confirmationBlocks * blockTime)),
            // notify users that this transfer failed definitely
            of(
              transfer.failure(
                new RaidenError(ErrorCodes.XFER_EXPIRED, {
                  expiration: doc.transfer.lock.expiration,
                }),
                meta,
              ),
            ),
          );
        }),
      ),
    ),
  );
}
