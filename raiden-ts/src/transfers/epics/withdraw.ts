import { Observable } from 'rxjs';
import { filter, map, withLatestFrom, mergeMap, pluck } from 'rxjs/operators';

import { RaidenAction } from '../../actions';
import { RaidenState } from '../../state';
import { RaidenEpicDeps } from '../../types';
import { ChannelState } from '../../channels';
import { isActionOf } from '../../utils/actions';
import { messageSend } from '../../messages/actions';
import { newBlock } from '../../channels/actions';
import { withdrawReceive, withdrawExpired } from '../actions';

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
    map((action) =>
      messageSend.request(
        { message: action.payload.message },
        {
          address: action.meta.partner,
          msgId: action.payload.message.message_identifier.toString(),
        },
      ),
    ),
  );

const confMult = [
  ['partner', 1],
  ['own', 2],
] as readonly ['own' | 'partner', number][];

/**
 * Remove [[WithdrawRequest]] from channel end's pending withdraw requests when they expire
 *
 * @param action$ - Observable of newBlock actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.config$ - Config observable
 * @returns Observable of withdrawExpired actions
 */
export const autoExpireWithdrawEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { config$ }: RaidenEpicDeps,
): Observable<withdrawExpired> =>
  action$.pipe(
    filter(newBlock.is),
    pluck('payload', 'blockNumber'),
    withLatestFrom(state$, config$),
    mergeMap(function* ([blockNumber, state, { confirmationBlocks }]) {
      for (const channel of Object.values(state.channels)) {
        if (channel.state !== ChannelState.open) continue;
        for (const [end, mul] of confMult) {
          for (const request of channel[end].withdrawRequests) {
            // mul here makes us wait double confirmation before expiring our 'own' requests
            // to give partner time to catch up with block and expire them
            if (request.expiration.add(confirmationBlocks * mul).gt(blockNumber)) continue;
            yield withdrawExpired(
              { participant: channel[end].address },
              {
                tokenNetwork: channel.tokenNetwork,
                partner: channel.partner.address,
                expiration: request.expiration.toNumber(),
                totalWithdraw: request.total_withdraw,
              },
            );
          }
        }
      }
    }),
  );
