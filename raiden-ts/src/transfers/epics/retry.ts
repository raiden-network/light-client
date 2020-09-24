/* eslint-disable @typescript-eslint/no-explicit-any */
import { combineLatest, EMPTY, Observable } from 'rxjs';
import { filter, mergeMap, withLatestFrom } from 'rxjs/operators';

import { RaidenAction } from '../../actions';
import { messageSend } from '../../messages/actions';
import { RaidenState } from '../../state';
import { RaidenEpicDeps } from '../../types';
import { isActionOf } from '../../utils/actions';
import { Address } from '../../utils/types';
import { pluckDistinct } from '../../utils/rx';
import {
  transferExpire,
  transferSigned,
  transferUnlock,
  transferSecretRequest,
  transferSecretReveal,
} from '../actions';
import { Direction } from '../state';
import { transferKey } from '../utils';
import { retrySendUntil$, exponentialBackoff } from './utils';

/**
 * Retry sending protocol messages until stop conditions are met.
 *
 * @param action$ - Observable of transferExpire.success actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.config$ - Config observable
 * @returns Observable of messageSend.request actions
 */
export const transferRetryMessageEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { config$ }: RaidenEpicDeps,
): Observable<messageSend.request> => {
  return action$.pipe(
    filter(
      isActionOf([
        transferSigned,
        transferUnlock.success,
        transferExpire.success,
        transferSecretRequest,
        transferSecretReveal,
      ]),
    ),
    withLatestFrom(state$, config$),
    mergeMap(([action, state, { pollingInterval, httpTimeout, revealTimeout }]) => {
      const transfer = state.transfers[transferKey(action.meta)];
      const transfer$ = state$.pipe(pluckDistinct('transfers', transferKey(action.meta)));

      let to: Address | undefined;
      let stop$: Observable<any> | undefined;
      switch (action.type) {
        case transferSigned.type:
          if (action.meta.direction === Direction.SENT) {
            to = action.payload.partner;
            stop$ = transfer$.pipe(
              filter(
                (transfer) =>
                  !!(
                    transfer.transferProcessed ||
                    transfer.unlockProcessed || // unlock|expired shouldn't happen before transferProcessed
                    transfer.expiredProcessed ||
                    transfer.channelClosed
                  ),
              ),
            );
          }
          break;
        case transferUnlock.success.type:
          if (action.meta.direction === Direction.SENT) {
            to = action.payload.partner;
            stop$ = transfer$.pipe(
              filter((transfer) => !!(transfer.unlockProcessed || transfer.channelClosed)),
            );
          }
          break;
        case transferExpire.success.type:
          if (action.meta.direction === Direction.SENT) {
            to = action.payload.partner;
            stop$ = transfer$.pipe(
              filter((transfer) => !!(transfer.expiredProcessed || transfer.channelClosed)),
            );
          }
          break;
        case transferSecretRequest.type:
          if (action.meta.direction === Direction.RECEIVED && transfer) {
            to = transfer.transfer.initiator;
            stop$ = combineLatest([state$, transfer$]).pipe(
              filter(
                ([{ blockNumber }, transfer]) =>
                  /* transfer.secret would be enough, but let's test secretReveal to possibly retry
                   * failed RevealSecret sign prompts */
                  !!(transfer.secretReveal || transfer.channelClosed) ||
                  // or when we get inside the danger zone
                  blockNumber > transfer.expiration - revealTimeout,
              ),
            );
          }
          break;
        case transferSecretReveal.type:
          if (action.meta.direction === Direction.RECEIVED && transfer) {
            to = transfer.partner;
            stop$ = transfer$.pipe(
              filter((transfer) => !!(transfer.unlock || transfer.channelClosed)),
            );
          }
          break;
      }

      if (!to || !stop$) return EMPTY;

      return retrySendUntil$(
        messageSend.request(
          { message: action.payload.message },
          { address: to, msgId: action.payload.message.message_identifier.toString() },
        ),
        action$,
        stop$,
        exponentialBackoff(pollingInterval, httpTimeout * 2),
      );
    }),
  );
};
