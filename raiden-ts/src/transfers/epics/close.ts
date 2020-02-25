import { Observable, from } from 'rxjs';
import { filter, mergeMap, withLatestFrom, map } from 'rxjs/operators';

import { RaidenAction } from '../../actions';
import { channelClose } from '../../channels/actions';
import { getBalanceProofFromEnvelopeMessage } from '../../messages/utils';
import { RaidenState } from '../../state';
import { isActionOf } from '../../utils/actions';
import { RaidenError, ErrorCodes } from '../../utils/error';
import { Hash } from '../../utils/types';
import { transfer } from '../actions';

/**
 * Complete or fail any pending transfer for any closing or closed channels
 * Transfer is considered successful if secret was revealed (as it could be claimed on-chain),
 * else it's considered as failed as couldn't succeed inside expiration timeout
 *
 * @param action$ - Observable of channelClose.{requet,success} actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of transfer.{success|failure} actions
 */
export const transferChannelClosedEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<transfer.success | transfer.failure> =>
  action$.pipe(
    filter(isActionOf([channelClose.request, channelClose.success])),
    withLatestFrom(state$),
    mergeMap(([action, state]) =>
      from(Object.entries(state.sent) as Array<[Hash, typeof state.sent[string]]>).pipe(
        filter(
          ([
            ,
            {
              transfer: [, transf],
            },
          ]) =>
            transf.token_network_address === action.meta.tokenNetwork &&
            transf.recipient === action.meta.partner,
        ),
        map(([secrethash, sent]) => {
          // as we can't know for sure if recipient/partner received the secret or unlock,
          //consider transfer failed iff neither the secret was revealed nor the unlock happened
          let action: transfer.failure | transfer.success;
          if (!sent.secretReveal && !sent.unlock)
            action = transfer.failure(
              new RaidenError(ErrorCodes.XFER_CHANNEL_CLOSED_PREMATURELY),
              { secrethash },
            );
          else if (sent.unlock)
            action = transfer.success(
              { balanceProof: getBalanceProofFromEnvelopeMessage(sent.unlock[1]) },
              { secrethash },
            );
          else action = transfer.success({}, { secrethash });
          return action;
        }),
      ),
    ),
  );
