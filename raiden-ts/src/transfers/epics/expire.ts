import type { Observable } from 'rxjs';
import { timer } from 'rxjs';
import {
  exhaustMap,
  filter,
  groupBy,
  mapTo,
  mergeMap,
  mergeMapTo,
  mergeWith,
  pluck,
  startWith,
  takeUntil,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import type { RaidenState } from '../../state';
import type { RaidenEpicDeps } from '../../types';
import { ErrorCodes, RaidenError } from '../../utils/error';
import { completeWith } from '../../utils/rx';
import { transfer, transferExpire } from '../actions';
import { Direction } from '../state';

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
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { config$ }: RaidenEpicDeps,
): Observable<transferExpire.request | transfer.failure> {
  const transferIsGone$ = ({ key }: { key: string }) =>
    state$.pipe(filter(({ transfers }) => !(key in transfers)));
  return state$.pipe(
    pluck('transfers'),
    mergeMap((transfers) => Object.values(transfers)),
    filter(({ direction }) => direction === Direction.SENT),
    groupBy(({ _id }) => _id, { duration: transferIsGone$ }),
    mergeMap((grouped$) =>
      grouped$.pipe(
        withLatestFrom(config$),
        exhaustMap(([{ expiration, transfer: locked }, { httpTimeout }]) => {
          const meta = { secrethash: locked.lock.secrethash, direction: Direction.SENT };
          return timer(new Date((expiration + 1) * 1e3)).pipe(
            mergeMapTo(
              timer(httpTimeout).pipe(
                mapTo(transferExpire.request(undefined, meta)),
                startWith(
                  transfer.failure(new RaidenError(ErrorCodes.XFER_EXPIRED, { expiration }), meta),
                ),
              ),
            ),
          );
        }),
        takeUntil(
          grouped$.pipe(
            filter((t) => !!(t.unlock || t.expired || t.secretRegistered || t.channelClosed)),
            mergeWith(transferIsGone$(grouped$)),
          ),
        ),
        completeWith(state$),
      ),
    ),
  );
}
