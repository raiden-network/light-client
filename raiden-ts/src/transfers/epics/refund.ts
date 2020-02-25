import { Observable } from 'rxjs';
import { filter, mergeMap, withLatestFrom } from 'rxjs/operators';

import { RaidenAction } from '../../actions';
import { messageReceived } from '../../messages/actions';
import { RefundTransfer } from '../../messages/types';
import { RaidenState } from '../../state';
import { isActionOf } from '../../utils/actions';
import { RaidenError, ErrorCodes } from '../../utils/error';
import { Signed } from '../../utils/types';
import { transfer, transferRefunded } from '../actions';

/**
 * Receiving RefundTransfer for pending transfer fails it
 *
 * @param action$ - Observable of messageReceived actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of transfer.failure|transferRefunded actions
 */
export const transferRefundedEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<transferRefunded | transfer.failure> =>
  action$.pipe(
    filter(isActionOf(messageReceived)),
    withLatestFrom(state$),
    mergeMap(function*([action, state]) {
      const message = action.payload.message;
      if (!message || !Signed(RefundTransfer).is(message)) return;
      const secrethash = message.lock.secrethash;
      if (!(secrethash in state.sent)) return;
      const [, sent] = state.sent[secrethash].transfer;
      if (
        message.initiator !== sent.recipient ||
        !message.payment_identifier.eq(sent.payment_identifier) ||
        !message.lock.amount.eq(sent.lock.amount) ||
        !message.lock.expiration.eq(sent.lock.expiration) ||
        state.sent[secrethash].unlock || // already unlocked
        state.sent[secrethash].lockExpired || // already expired
        state.sent[secrethash].channelClosed || // channel closed
        message.lock.expiration.lte(state.blockNumber) // lock expired but transfer didn't yet
      )
        return;
      yield transferRefunded({ message }, { secrethash });
      yield transfer.failure(new RaidenError(ErrorCodes.XFER_REFUNDED), { secrethash });
    }),
  );
