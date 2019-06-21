import { bigNumberify } from 'ethers/utils';
import { ChannelState } from 'raiden/channels';
import { RaidenState, encodeRaidenState, decodeRaidenState } from 'raiden/store/state';

describe('RaidenState codecs', () => {
  const address = '0x1111111111111111111111111111111111111111',
    token = '0x0000000000000000000000000000000000010001',
    tokenNetwork = '0x0000000000000000000000000000000000020001',
    partner = '0x0000000000000000000000000000000000000020';

  test('encodeRaidenState', () => {
    const state: RaidenState = {
      address,
      blockNumber: 123,
      tokenNetworks: {
        [tokenNetwork]: {
          [partner]: {
            state: ChannelState.open,
            own: { deposit: bigNumberify(200) },
            partner: { deposit: bigNumberify(210) },
          },
        },
      },
      token2tokenNetwork: { [token]: tokenNetwork },
    };
    expect(JSON.parse(encodeRaidenState(state))).toEqual({
      address,
      blockNumber: 123,
      tokenNetworks: {
        [tokenNetwork]: {
          [partner]: {
            state: 'open',
            own: { deposit: '200' },
            partner: { deposit: '210' },
          },
        },
      },
      token2tokenNetwork: { [token]: tokenNetwork },
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
        tokenNetworks: {
          [tokenNetwork]: {
            [partner]: {
              state: 'unknownstate',
              own: { deposit: 'invalidBigNumber' },
              partner: { deposit: '210' },
            },
          },
        },
        token2tokenNetwork: {},
      }),
    ).toThrow('Invalid value "unknownstate"');

    // success on deep BigNumber and enum
    expect(
      decodeRaidenState({
        address,
        blockNumber: 123,
        tokenNetworks: {
          [tokenNetwork]: {
            [partner]: {
              state: 'open',
              own: { deposit: '200' },
              partner: { deposit: '210' },
            },
          },
        },
        token2tokenNetwork: { [token]: tokenNetwork },
      }),
    ).toEqual({
      address,
      blockNumber: 123,
      tokenNetworks: {
        [tokenNetwork]: {
          [partner]: {
            state: ChannelState.open,
            own: { deposit: bigNumberify(200) },
            partner: { deposit: bigNumberify(210) },
          },
        },
      },
      token2tokenNetwork: { [token]: tokenNetwork },
    });
  });
});
