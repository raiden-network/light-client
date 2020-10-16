import { from, merge, Observable, of } from 'rxjs';
import { exhaustMap, filter, mergeMap, pluck, withLatestFrom } from 'rxjs/operators';

import { RaidenAction } from '../../actions';
import { newBlock } from '../../channels/actions';
import { RaidenState } from '../../state';
import { RaidenEpicDeps } from '../../types';
import { isResponseOf } from '../../utils/actions';
import { RaidenError, ErrorCodes } from '../../utils/error';
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
 * @returns Observable of transferExpire.request|transfer.failure actions
 */
export function transferAutoExpireEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { config$ }: RaidenEpicDeps,
): Observable<transferExpire.request | transfer.failure> {
  return action$.pipe(
    filter(newBlock.is),
    pluck('payload', 'blockNumber'),
    withLatestFrom(state$, config$),
    // With interactive signing sending a lock expired message requires user
    // intervention. In that case it is possible for a new block to arrive
    // while waiting for the user permission, without the `exhaustMap` below
    // multiple signing requests would be emited *for the same lock*.
    // `exhaustMap` prevents that from happening, by blocking new signing
    // requests until the existing ones have been concluded.
    exhaustMap(([blockNumber, { transfers }, { confirmationBlocks }]) =>
      from(
        Object.values(transfers).filter(
          (r) =>
            r.direction === Direction.SENT &&
            !r.unlock &&
            !r.expired &&
            !r.secretRegistered &&
            !r.channelClosed &&
            r.expiration <= blockNumber - confirmationBlocks * 2,
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
            ),
            // notify users that this transfer failed definitely
            of(
              transfer.failure(
                new RaidenError(ErrorCodes.XFER_EXPIRED, {
                  block: doc.transfer.lock.expiration.toString(),
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
