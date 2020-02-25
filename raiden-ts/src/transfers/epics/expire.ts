import { merge, Observable, of } from 'rxjs';
import { exhaustMap, filter, withLatestFrom } from 'rxjs/operators';

import { RaidenAction } from '../../actions';
import { newBlock } from '../../channels/actions';
import { RaidenConfig } from '../../config';
import { RaidenState } from '../../state';
import { RaidenEpicDeps } from '../../types';
import { isActionOf, isResponseOf } from '../../utils/actions';
import { RaidenError, ErrorCodes } from '../../utils/error';
import { Hash } from '../../utils/types';
import { transfer, transferExpire } from '../actions';
import { dispatchAndWait$ } from './utils';

/**
 * Contains the core logic of {@link transferAutoExpireEpic}.
 *
 * @param action$ - Observable of {@link RaidenAction} actions
 * @param state - Contains The current state of the app
 * @param config - Contains the current app config
 * @param blockNumber - The current block number
 * @returns Observable of {@link transferExpire.request} or {@link transfer.failure} actions
 */
function autoExpire$(
  action$: Observable<RaidenAction>,
  state: RaidenState,
  { confirmationBlocks }: RaidenConfig,
  blockNumber: number,
): Observable<transferExpire.request | transfer.failure> {
  const requests$: Observable<transferExpire.request | transfer.failure>[] = [];

  for (const [key, sent] of Object.entries(state.sent)) {
    if (
      sent.unlock ||
      sent.lockExpired ||
      sent.channelClosed ||
      sent.transfer[1].lock.expiration.add(confirmationBlocks).gt(blockNumber) ||
      // don't expire if secret got registered before lock expired
      (sent.secret?.[1]?.registerBlock &&
        sent.transfer[1].lock.expiration.gte(sent.secret?.[1]?.registerBlock))
    )
      continue;
    const secrethash = key as Hash;
    // this observable acts like a Promise: emits request once, completes on success/failure
    const requestAndWait$ = dispatchAndWait$(
      action$,
      transferExpire.request(undefined, { secrethash }),
      isResponseOf(transferExpire, { secrethash }),
    );
    requests$.push(requestAndWait$);
    // notify users that this transfer failed definitely
    requests$.push(
      of(
        transfer.failure(
          new RaidenError(ErrorCodes.XFER_EXPIRED, {
            block: sent.transfer[1].lock.expiration.toString(),
          }),
          { secrethash },
        ),
      ),
    );
  }

  // process all requests before completing and restart handling newBlocks (in exhaustMap)
  return merge(...requests$);
}

/**
 * Process newBlocks, emits transferExpire.request (request to compose&sign LockExpired for a transfer)
 * if pending transfer's lock expired and transfer didn't unlock (succeed) in time
 * Also, emits transfer.failure, to notify users that a transfer has failed (although it'll only be
 * considered as completed with fail once the transferExpireProcessed arrives).
 *
 * @param action$ - Observable of newBlock|transferExpire.success|transferExpire.failure actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of transferExpire.request|transfer.failure actions
 */
export const transferAutoExpireEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { config$ }: RaidenEpicDeps,
): Observable<transferExpire.request | transfer.failure> =>
  action$.pipe(
    filter(isActionOf(newBlock)),
    withLatestFrom(state$, config$),
    // exhaustMap ignores new blocks while previous request batch is still pending
    exhaustMap(([{ payload: { blockNumber } }, state, config]) =>
      autoExpire$(action$, state, config, blockNumber),
    ),
  );
