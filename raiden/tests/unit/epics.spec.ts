import { of } from 'rxjs';

import { ActionsObservable } from 'redux-observable';

import { AddressZero } from 'ethers/constants';

import { RaidenState, initialState } from 'raiden/store/state';
import {
  RaidenActions,
  RaidenActionType,
  tokenMonitor,
  tokenMonitored,
} from 'raiden/store/actions';
import { stateOutputEpic, actionOutputEpic, tokenMonitorEpic } from 'raiden/store/epics';

import { raidenEpicDeps } from './mocks';

describe('raidenEpics', () => {
  // mocks for all RaidenEpicDeps properties
  let { depsMock, registryFunctions } = raidenEpicDeps();

  afterEach(() => {
    ({ depsMock, registryFunctions } = raidenEpicDeps());
  });

  test('stateOutputEpic', async () => {
    const outputPromise = depsMock.stateOutput$.toPromise();
    const epicPromise = stateOutputEpic(
      ActionsObservable.of<RaidenActions>(),
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
      ActionsObservable.of<RaidenActions>(action),
      of<RaidenState>(initialState),
      depsMock,
    ).toPromise();

    // actionOutputEpic is an action sink and doesn't emit any action
    await expect(epicPromise).resolves.toBeUndefined();
    // actionOutput$ completes (because action$ completed) and last value was our random action
    await expect(outputPromise).resolves.toBe(action);
  });

  test('tokenMonitorEpic succeeds first', async () => {
    const action$ = ActionsObservable.of<RaidenActions>(tokenMonitor('0xtoken')),
      state$ = of<RaidenState>(initialState);

    // toPromise will ensure observable completes and resolve to last emitted value
    const result = await tokenMonitorEpic(action$, state$, depsMock).toPromise();
    expect(result).toEqual(tokenMonitored('0xtoken', '0xtokenNetwork', true));
  });

  test('tokenMonitorEpic succeeds already monitored', async () => {
    const action$ = ActionsObservable.of<RaidenActions>(tokenMonitor('0xtoken')),
      state$ = of<RaidenState>({
        ...initialState,
        token2tokenNetwork: { '0xtoken': '0xtokenNetwork' },
      });

    // toPromise will ensure observable completes and resolve to last emitted value
    const result = await tokenMonitorEpic(action$, state$, depsMock).toPromise();
    expect(result).toEqual(tokenMonitored('0xtoken', '0xtokenNetwork', false));
  });

  test('tokenMonitorEpic fails', async () => {
    const action$ = ActionsObservable.of<RaidenActions>(tokenMonitor('0xtoken')),
      state$ = of<RaidenState>(initialState);
    registryFunctions.token_to_token_networks.mockResolvedValueOnce(AddressZero);

    const result = await tokenMonitorEpic(action$, state$, depsMock).toPromise();
    expect(result).toMatchObject({
      type: RaidenActionType.TOKEN_MONITOR_FAILED,
      token: '0xtoken',
    });
    expect(result.error).toBeInstanceOf(Error);
  });
});
