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
import { tokenMonitorEpic } from 'raiden/store/epics';

import { raidenEpicDeps } from './mocks';

describe('raidenEpics', () => {
  // mocks for all RaidenEpicDeps properties
  const { depsMock, registryFunctions } = raidenEpicDeps();

  afterEach(() => {
    jest.clearAllMocks();
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
