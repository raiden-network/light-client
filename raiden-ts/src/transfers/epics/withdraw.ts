import { Observable } from 'rxjs';
import { filter, map, mergeMap } from 'rxjs/operators';

import { RaidenAction } from '../../actions';
import { Signed } from '../../utils/types';
import { isActionOf } from '../../utils/actions';
import { messageReceived, messageSend } from '../../messages/actions';
import { WithdrawRequest } from '../../messages/types';
import { withdrawReceive } from '../actions';

/**
 * When receiving a [[WithdrawRequest]] message, create the respective [[withdrawReceive.request]]
 * action
 *
 * @param action$ - Observable of messageReceived actions
 * @returns Observable of withdrawReceive.request actions
 */
export const withdrawRequestReceivedEpic = (
  action$: Observable<RaidenAction>,
): Observable<withdrawReceive.request> =>
  action$.pipe(
    filter(isActionOf(messageReceived)),
    mergeMap(function*(action) {
      const message = action.payload.message;
      if (
        !message ||
        !Signed(WithdrawRequest).is(message) ||
        message.participant !== action.meta.address
      )
        return;
      yield withdrawReceive.request(
        { message },
        {
          tokenNetwork: message.token_network_address,
          partner: message.participant,
          totalWithdraw: message.total_withdraw,
          expiration: message.expiration.toNumber(),
        },
      );
    }),
  );

/**
 * sendMessage when a [[withdrawReceive.success]] action is fired
 *
 * @param action$ - Observable of withdrawReceive.success actions
 * @returns Observable of messageSend.request actions
 */
export const withdrawSendConfirmationEpic = (
  action$: Observable<RaidenAction>,
): Observable<messageSend.request> =>
  action$.pipe(
    filter(isActionOf(withdrawReceive.success)),
    map(action =>
      messageSend.request(
        { message: action.payload.message },
        {
          address: action.meta.partner,
          msgId: action.payload.message.message_identifier.toString(),
        },
      ),
    ),
  );
