import { Observable } from 'rxjs';
import { filter, mergeMap, withLatestFrom } from 'rxjs/operators';
import { ActionType, isActionOf } from 'typesafe-actions';

import { RaidenAction } from '../../actions';
import { ChannelState } from '../../channels';
import { RaidenState } from '../state';
import { channelSettleable, newBlock } from '../../channels/actions';

/**
 * Process newBlocks, emits ChannelSettleableAction if any closed channel is now settleable
 */
export const newBlockEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<ActionType<typeof channelSettleable>> =>
  action$.pipe(
    filter(isActionOf(newBlock)),
    withLatestFrom(state$),
    mergeMap(function*([
      {
        payload: { blockNumber },
      },
      state,
    ]) {
      for (const tokenNetwork in state.tokenNetworks) {
        for (const partner in state.tokenNetworks[tokenNetwork]) {
          const channel = state.tokenNetworks[tokenNetwork][partner];
          if (
            channel.state === ChannelState.closed &&
            channel.settleTimeout && // closed channels always have settleTimeout & closeBlock set
            channel.closeBlock &&
            blockNumber > channel.closeBlock + channel.settleTimeout
          ) {
            yield channelSettleable({ settleableBlock: blockNumber }, { tokenNetwork, partner });
          }
        }
      }
    }),
  );
