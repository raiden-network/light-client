import { bigNumberify } from 'ethers/utils';
import { channelDeposit, channelDepositFailed, channelMonitored } from 'raiden/store/actions';

describe('action factories not tested in reducers.spec.ts', () => {
  test('channelMonitor', () => {
    const tokenNetwork = '0xtokenNetwork',
      partner = '0xpartner',
      id = 12,
      fromBlock = 5123;
    expect(channelMonitored({ id, fromBlock }, { tokenNetwork, partner })).toEqual({
      type: 'channelMonitored',
      payload: { id, fromBlock },
      meta: { tokenNetwork, partner },
    });
  });

  test('channelDeposit', () => {
    const tokenNetwork = '0xtokenNetwork',
      partner = '0xpartner',
      deposit = bigNumberify(999);
    expect(channelDeposit({ deposit }, { tokenNetwork, partner })).toEqual({
      type: 'channelDeposit',
      payload: { deposit },
      meta: { tokenNetwork, partner },
    });
  });

  test('channelDepositFailed', () => {
    const tokenNetwork = '0xtokenNetwork',
      partner = '0xpartner',
      error = new Error('not enough funds');
    expect(channelDepositFailed(error, { tokenNetwork, partner })).toEqual({
      type: 'channelDepositFailed',
      payload: error,
      meta: { tokenNetwork, partner },
      error: true,
    });
  });
});
