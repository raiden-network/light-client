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
          ([, sent]) =>
            sent.transfer[1].token_network_address === action.meta.tokenNetwork &&
            sent.transfer[1].recipient === action.meta.partner,
        ),
        map(([secrethash, sent]) => {
          // as we can't know for sure if recipient/partner received the secret or unlock,
          //consider transfer failed iff neither the secret was revealed nor the unlock happened
          if (!sent.secretReveal && !sent.unlock)
            return transfer.failure(new RaidenError(ErrorCodes.XFER_CHANNEL_CLOSED_PREMATURELY), {
              secrethash,
            });
          else {
            const payload = sent.unlock
              ? { balanceProof: getBalanceProofFromEnvelopeMessage(sent.unlock[1]) }
              : {};
            return transfer.success(payload, { secrethash });
          }
        }),
      ),
    ),
  );
