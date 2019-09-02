import { bigNumberify } from 'ethers/utils';

import { ChannelState } from 'raiden-ts/channels';
import { decodeRaidenState, encodeRaidenState, RaidenState } from 'raiden-ts/state';
import { Address, UInt } from 'raiden-ts/utils/types';

describe('RaidenState codecs', () => {
  const address = '0x1111111111111111111111111111111111111111' as Address,
    token = '0x0000000000000000000000000000000000010001' as Address,
    tokenNetwork = '0x0000000000000000000000000000000000020001' as Address,
    partner = '0x0000000000000000000000000000000000000020' as Address;

  test('encodeRaidenState', () => {
    const state: RaidenState = {
      address,
      blockNumber: 123,
      channels: {
        [tokenNetwork]: {
          [partner]: {
            state: ChannelState.open,
            own: { deposit: bigNumberify(200) as UInt<32> },
            partner: { deposit: bigNumberify(210) as UInt<32> },
            id: 17,
            settleTimeout: 500,
            openBlock: 121,
            isFirstParticipant: true,
          },
        },
      },
      tokens: { [token]: tokenNetwork },
      transport: {},
      secrets: {},
      sent: {},
    };
    expect(JSON.parse(encodeRaidenState(state))).toEqual({
      address,
      blockNumber: 123,
      channels: {
        [tokenNetwork]: {
          [partner]: {
            state: 'open',
            own: { deposit: 200 },
            partner: { deposit: 210 },
            id: 17,
            settleTimeout: 500,
            openBlock: 121,
            isFirstParticipant: true,
          },
        },
      },
      tokens: { [token]: tokenNetwork },
      transport: {},
      secrets: {},
      sent: {},
    });
  });

  test('decodeRaidenState', () => {
    // missing required properties
    expect(() => decodeRaidenState({ address })).toThrow('Invalid value undefined');

    // property of wrong type
    expect(() => decodeRaidenState({ address: 123 })).toThrow('Invalid value 123');

    // invalid deep enum value and BigNumber
    expect(() =>
      decodeRaidenState({
        address,
        blockNumber: 123,
        channels: {
          [tokenNetwork]: {
            [partner]: {
              state: 'unknownstate',
              own: { deposit: 'invalidBigNumber' },
              partner: { deposit: '210' },
            },
          },
        },
        tokens: {},
        transport: {},
        secrets: {},
        sent: {},
      }),
    ).toThrow('Invalid value "unknownstate"');

    // success on deep BigNumber and enum
    expect(
      decodeRaidenState({
        address,
        blockNumber: 123,
        channels: {
          [tokenNetwork]: {
            [partner]: {
              state: 'open',
              own: { deposit: '200' },
              partner: { deposit: '210' },
              id: 17,
              settleTimeout: 500,
              openBlock: 121,
              isFirstParticipant: true,
            },
          },
        },
        tokens: { [token]: tokenNetwork },
        transport: {},
        secrets: {},
        sent: {},
      }),
    ).toEqual({
      address,
      blockNumber: 123,
      channels: {
        [tokenNetwork]: {
          [partner]: {
            state: ChannelState.open,
            own: { deposit: bigNumberify(200) as UInt<32> },
            partner: { deposit: bigNumberify(210) as UInt<32> },
            id: 17,
            settleTimeout: 500,
            openBlock: 121,
            isFirstParticipant: true,
          },
        },
      },
      tokens: { [token]: tokenNetwork },
      transport: {},
      secrets: {},
      sent: {},
    });
  });
});
