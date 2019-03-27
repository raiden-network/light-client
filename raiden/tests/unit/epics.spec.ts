import { merge, of } from 'rxjs';
import { tap, ignoreElements } from 'rxjs/operators';
import { marbles } from 'rxjs-marbles/jest';

import { AddressZero } from 'ethers/constants';

import { RaidenState, ChannelState, initialState } from 'raiden/store/state';
import { bigNumberify } from 'raiden/store/types';
import {
  RaidenActions,
  RaidenActionType,
  tokenMonitor,
  tokenMonitored,
  raidenInit,
  channelMonitored,
  newBlock,
} from 'raiden/store/actions';
import {
  stateOutputEpic,
  actionOutputEpic,
  raidenInitializationEpic,
  tokenMonitorEpic,
} from 'raiden/store/epics';

import { raidenEpicDeps } from './mocks';

describe('raidenEpics', () => {
  // mocks for all RaidenEpicDeps properties
  let depsMock = raidenEpicDeps();

  afterEach(() => {
    depsMock = raidenEpicDeps();
  });

  test('stateOutputEpic', async () => {
    const outputPromise = depsMock.stateOutput$.toPromise();
    const epicPromise = stateOutputEpic(
      of<RaidenActions>(),
      of<RaidenState>({ ...initialState, blockNumber: 999 }),
      depsMock,
    ).toPromise();

    // stateOutputEpic is an state sink and doesn't emit any action
    await expect(epicPromise).resolves.toBeUndefined();
    // stateOutput$ completes (because state$ completed) and last value was our last emitted state
    await expect(outputPromise).resolves.toMatchObject({ blockNumber: 999 });
  });

  test('actionOutputEpic', async () => {
    const action = tokenMonitor('0xtoken'); // a random action
    const outputPromise = depsMock.actionOutput$.toPromise();
    const epicPromise = actionOutputEpic(
      of<RaidenActions>(action),
      of<RaidenState>(initialState),
      depsMock,
    ).toPromise();

    // actionOutputEpic is an action sink and doesn't emit any action
    await expect(epicPromise).resolves.toBeUndefined();
    // actionOutput$ completes (because action$ completed) and last value was our random action
    await expect(outputPromise).resolves.toBe(action);
  });

  test('tokenMonitorEpic succeeds first', async () => {
    const action$ = of<RaidenActions>(tokenMonitor('0xtoken')),
      state$ = of<RaidenState>(initialState);

    // toPromise will ensure observable completes and resolve to last emitted value
    const result = await tokenMonitorEpic(action$, state$, depsMock).toPromise();
    expect(result).toEqual(tokenMonitored('0xtoken', '0xtokenNetwork', true));
  });

  test('tokenMonitorEpic succeeds already monitored', async () => {
    const action$ = of<RaidenActions>(tokenMonitor('0xtoken')),
      state$ = of<RaidenState>({
        ...initialState,
        token2tokenNetwork: { '0xtoken': '0xtokenNetwork' },
      });

    // toPromise will ensure observable completes and resolve to last emitted value
    const result = await tokenMonitorEpic(action$, state$, depsMock).toPromise();
    expect(result).toEqual(tokenMonitored('0xtoken', '0xtokenNetwork', false));
  });

  test('tokenMonitorEpic fails', async () => {
    const action$ = of<RaidenActions>(tokenMonitor('0xtoken')),
      state$ = of<RaidenState>(initialState);
    depsMock.registryContract.functions.token_to_token_networks.mockResolvedValueOnce(AddressZero);

    const result = await tokenMonitorEpic(action$, state$, depsMock).toPromise();
    expect(result).toMatchObject({
      type: RaidenActionType.TOKEN_MONITOR_FAILED,
      token: '0xtoken',
    });
    expect(result.error).toBeInstanceOf(Error);
  });

  test(
    'raidenInitializationEpic',
    marbles(m => {
      const state: RaidenState = {
        address: '0xaddress',
        blockNumber: 123,
        tokenNetworks: {
          '0xtokenNetwork': {
            '0xpartner': {
              state: ChannelState.open,
              totalDeposit: bigNumberify(200),
              partnerDeposit: bigNumberify(210),
              id: 17,
              settleTimeout: 500,
              openBlock: 119,
            },
          },
        },
        token2tokenNetwork: { '0xtoken': '0xtokenNetwork' },
      };
      /* this test requires mocked provider, or else emit is called with setTimeout and doesn't run
       * before the return of the function.
       */
      const action$ = m.cold('---a--|', { a: raidenInit() }),
        state$ = m.cold('--s---|', { s: state }),
        emitBlock$ = m.cold('----------b--|').pipe(
          tap(() => depsMock.provider.emit('block', 124)),
          ignoreElements(),
        );
      m.expect(
        merge(emitBlock$, raidenInitializationEpic(action$, state$, depsMock)),
      ).toBeObservable(
        m.cold('---(tc)---b-', {
          t: tokenMonitored('0xtoken', '0xtokenNetwork', false),
          c: channelMonitored('0xtokenNetwork', '0xpartner', 17),
          b: newBlock(124),
        }),
      );
    }),
  );
});
