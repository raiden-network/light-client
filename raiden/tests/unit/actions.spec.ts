import {
  RaidenActionType,
  channelDeposit,
  channelDepositFailed,
  channelMonitored,
  tokenMonitor,
  tokenMonitorFailed,
} from 'raiden/store';
import { bigNumberify } from 'raiden/store/types';

describe('action factories not tested in reducers.spec.ts', () => {
  test('tokenMonitor', () => {
    const token = '0xtoken';
    expect(tokenMonitor(token)).toEqual({
      type: RaidenActionType.TOKEN_MONITOR,
      token,
    });
  });

  test('tokenMonitorFailed', () => {
    const token = '0xtoken',
      error = new Error('tokenNetwork not found');
    expect(tokenMonitorFailed(token, error)).toEqual({
      type: RaidenActionType.TOKEN_MONITOR_FAILED,
      token,
      error,
    });
  });

  test('channelMonitor', () => {
    const tokenNetwork = '0xtokenNetwork',
      partner = '0xpartner',
      id = 12,
      fromBlock = 5123;
    expect(channelMonitored(tokenNetwork, partner, id, fromBlock)).toEqual({
      type: RaidenActionType.CHANNEL_MONITOR,
      tokenNetwork,
      partner,
      id,
      fromBlock,
    });
  });

  test('channelDeposit', () => {
    const tokenNetwork = '0xtokenNetwork',
      partner = '0xpartner',
      deposit = bigNumberify(999);
    expect(channelDeposit(tokenNetwork, partner, deposit)).toEqual({
      type: RaidenActionType.CHANNEL_DEPOSIT,
      tokenNetwork,
      partner,
      deposit,
    });
  });

  test('channelDepositFailed', () => {
    const tokenNetwork = '0xtokenNetwork',
      partner = '0xpartner',
      error = new Error('not enough funds');
    expect(channelDepositFailed(tokenNetwork, partner, error)).toEqual({
      type: RaidenActionType.CHANNEL_DEPOSIT_FAILED,
      tokenNetwork,
      partner,
      error,
    });
  });
});
