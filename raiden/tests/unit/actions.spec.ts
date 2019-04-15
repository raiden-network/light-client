import { bigNumberify } from 'ethers/utils';
import {
  RaidenActionType,
  channelDeposit,
  channelDepositFailed,
  channelMonitored,
} from 'raiden/store';

describe('action factories not tested in reducers.spec.ts', () => {
  test('channelMonitor', () => {
    const tokenNetwork = '0xtokenNetwork',
      partner = '0xpartner',
      id = 12,
      fromBlock = 5123;
    expect(channelMonitored(tokenNetwork, partner, id, fromBlock)).toEqual({
      type: RaidenActionType.CHANNEL_MONITORED,
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
