import { Observable } from 'rxjs';
import { filter, map, mergeMap, withLatestFrom } from 'rxjs/operators';

import { RaidenAction } from '../../actions';
import { messageSend } from '../../messages/actions';
import { Processed } from '../../messages/types';
import { getBalanceProofFromEnvelopeMessage, isMessageReceivedOfType } from '../../messages/utils';
import { RaidenState } from '../../state';
import { RaidenEpicDeps } from '../../types';
import { Signed } from '../../utils/types';
import { isActionOf } from '../../utils/actions';
import {
  transfer,
  transferExpireProcessed,
  transferProcessed,
  transferUnlockProcessed,
} from '../actions';
import { Direction } from '../state';
import { getTransfer } from '../utils';

/**
 * Handles receiving a signed Processed for some sent LockedTransfer, Unlock or LockExpired
 * This will persist the Processed reply in transfer state and stop message retry
 *
 * @param action$ - Observable of messageReceived actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of transfer*Processed|transfer.success actions
 */
export function transferProcessedReceivedEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<
  transfer.success | transferProcessed | transferUnlockProcessed | transferExpireProcessed
> {
  return action$.pipe(
    filter(isMessageReceivedOfType(Signed(Processed))),
    withLatestFrom(state$),
    mergeMap(function* ([action, { transfers }]) {
      for (const transferState of Object.values(transfers)) {
        if (
          transferState.direction !== Direction.SENT ||
          transferState.partner !== action.meta.address
        )
          continue;

        const meta = { secrethash: transferState.secrethash, direction: Direction.SENT };
        if (
          action.payload.message.message_identifier.eq(transferState.transfer.message_identifier)
        ) {
          yield transferProcessed({ message: action.payload.message }, meta);
        } else if (
          action.payload.message.message_identifier.eq(
            transferState.unlock?.message_identifier ?? -1,
          )
        ) {
          // Unlock's Processed also notifies whole transfer as success
          yield transfer.success(
            {
              balanceProof: getBalanceProofFromEnvelopeMessage(transferState.unlock!),
            },
            meta,
          );
          yield transferUnlockProcessed({ message: action.payload.message }, meta);
        } else if (
          action.payload.message.message_identifier.eq(
            transferState.expired?.message_identifier ?? -1,
          )
        ) {
          yield transferExpireProcessed({ message: action.payload.message }, meta);
        }
      }
    }),
  );
}

/**
 * Handles sending Processed for a received EnvelopeMessages
 *
 * @param action$ - Observable of transferProcessed actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.db - Database instance
 * @returns Observable of messageSend.request actions
 */
export function transferProcessedSendEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { db }: RaidenEpicDeps,
): Observable<messageSend.request> {
  return action$.pipe(
    filter(isActionOf([transferProcessed, transferUnlockProcessed, transferExpireProcessed])),
    // transfer direction is RECEIVED, not message direction (which is outbound)
    filter((action) => action.meta.direction === Direction.RECEIVED),
    withLatestFrom(state$),
    mergeMap(([action, state]) =>
      getTransfer(state, db, action.meta).then(
        (transferState) => [action, transferState] as const,
      ),
    ),
    map(([action, transferState]) =>
      messageSend.request(
        { message: action.payload.message },
        {
          address: transferState.partner,
          msgId: action.payload.message.message_identifier.toString(),
        },
      ),
    ),
  );
}
