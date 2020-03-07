import { Observable } from 'rxjs';
import { filter, mergeMap, withLatestFrom } from 'rxjs/operators';
import isEqualWith from 'lodash/isEqualWith';

import { RaidenAction } from '../../actions';
import { RefundTransfer } from '../../messages/types';
import { isMessageReceivedOfType } from '../../messages/utils';
import { RaidenState } from '../../state';
import { RaidenError, ErrorCodes } from '../../utils/error';
import { Signed, BigNumberC } from '../../utils/types';
import { transfer, transferRefunded } from '../actions';

// Compare two objects, using .eq for BigNumber properties
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bnIsEqual(obj: any, other: any): boolean {
  return isEqualWith(obj, other, (objVal, othVal) =>
    BigNumberC.is(objVal)
      ? objVal.eq(othVal)
      : BigNumberC.is(othVal)
      ? othVal.eq(objVal)
      : undefined,
  );
}
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
    filter(isMessageReceivedOfType(Signed(RefundTransfer))),
    withLatestFrom(state$),
    mergeMap(function*([action, state]) {
      const message = action.payload.message;
      const secrethash = message.lock.secrethash;
      if (!(secrethash in state.sent)) return;
      const sent = state.sent[secrethash],
        transf = sent.transfer[1];
      if (
        message.initiator !== transf.recipient ||
        !message.payment_identifier.eq(transf.payment_identifier) ||
        !bnIsEqual(message.lock, transf.lock)
      )
        return;
      if (
        sent.unlock || // already unlocked
        sent.lockExpired || // already expired
        sent.channelClosed || // channel closed
        transf.lock.expiration.lte(state.blockNumber) // lock expired but transfer didn't yet
      )
        return;
      yield transferRefunded({ message }, { secrethash });
      yield transfer.failure(new RaidenError(ErrorCodes.XFER_REFUNDED), { secrethash });
    }),
  );
