import { bigNumberify } from 'ethers/utils';

import { channelDeposit, channelDepositFailed, channelMonitored } from 'raiden-ts/channels/actions';
import { Address } from 'raiden-ts/utils/types';

describe('action factories not tested in reducers.spec.ts', () => {
  const tokenNetwork = '0x0000000000000000000000000000000000020001' as Address,
    partner = '0x0000000000000000000000000000000000000020' as Address;
  test('channelMonitor', () => {
    const id = 12,
      fromBlock = 5123;
    expect(channelMonitored({ id, fromBlock }, { tokenNetwork, partner })).toEqual({
      type: 'channelMonitored',
      payload: { id, fromBlock },
      meta: { tokenNetwork, partner },
    });
  });

  test('channelDeposit', () => {
    const deposit = bigNumberify(999);
    expect(channelDeposit({ deposit }, { tokenNetwork, partner })).toEqual({
      type: 'channelDeposit',
      payload: { deposit },
      meta: { tokenNetwork, partner },
    });
  });

  test('channelDepositFailed', () => {
    const error = new Error('not enough funds');
    expect(channelDepositFailed(error, { tokenNetwork, partner })).toEqual({
      type: 'channelDepositFailed',
      payload: error,
      meta: { tokenNetwork, partner },
      error: true,
    });
  });
});
