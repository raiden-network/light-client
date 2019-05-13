import { ofType } from 'redux-observable';
import { Observable } from 'rxjs';
import { mergeMap, withLatestFrom } from 'rxjs/operators';

import { RaidenState, ChannelState } from '../state';
import {
  RaidenActionType,
  RaidenActions,
  NewBlockAction,
  ChannelSettleableAction,
  channelSettleable,
} from '../actions';

/**
 * Process newBlocks, emits ChannelSettleableAction if any closed channel is now settleable
 */
export const newBlockEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
): Observable<ChannelSettleableAction> =>
  action$.pipe(
    ofType<RaidenActions, NewBlockAction>(RaidenActionType.NEW_BLOCK),
    withLatestFrom(state$),
    mergeMap(function*([{ blockNumber }, state]) {
      for (const tokenNetwork in state.tokenNetworks) {
        for (const partner in state.tokenNetworks[tokenNetwork]) {
          const channel = state.tokenNetworks[tokenNetwork][partner];
          if (
            channel.state === ChannelState.closed &&
            channel.settleTimeout && // closed channels always have settleTimeout & closeBlock set
            channel.closeBlock &&
            blockNumber > channel.closeBlock + channel.settleTimeout
          ) {
            yield channelSettleable(tokenNetwork, partner, blockNumber);
          }
        }
      }
    }),
  );
