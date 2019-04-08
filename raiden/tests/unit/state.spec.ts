import { bigNumberify } from 'ethers/utils';
import {
  RaidenState,
  ChannelState,
  encodeRaidenState,
  decodeRaidenState,
} from 'raiden/store/state';

describe('RaidenState codecs', () => {
  test('encodeRaidenState', () => {
    const state: RaidenState = {
      address: '0xaddress',
      blockNumber: 123,
      tokenNetworks: {
        '0xtokenNetwork': {
          '0xpartner': {
            state: ChannelState.open,
            totalDeposit: bigNumberify(200),
            partnerDeposit: bigNumberify(210),
          },
        },
      },
      token2tokenNetwork: { '0xtoken': '0xtokenNetwork' },
    };
    expect(JSON.parse(encodeRaidenState(state))).toEqual({
      address: '0xaddress',
      blockNumber: 123,
      tokenNetworks: {
        '0xtokenNetwork': {
          '0xpartner': {
            state: 'open',
            totalDeposit: '200',
            partnerDeposit: '210',
          },
        },
      },
      token2tokenNetwork: { '0xtoken': '0xtokenNetwork' },
    });
  });

  test('decodeRaidenState', () => {
    // missing required properties
    expect(() => decodeRaidenState({ address: '0xaddress' })).toThrow('Invalid value undefined');

    // property of wrong type
    expect(() => decodeRaidenState({ address: 123 })).toThrow('Invalid value 123');

    // invalid deep enum value and BigNumber
    expect(() =>
      decodeRaidenState({
        address: '0xaddress',
        blockNumber: 123,
        tokenNetworks: {
          '0xtokenNetwork': {
            '0xpartner': {
              state: 'unknownstate',
              totalDeposit: 'invalidBigNumber',
              partnerDeposit: '210',
            },
          },
        },
        token2tokenNetwork: {},
      }),
    ).toThrow('Invalid value "unknownstate"');

    // success on deep BigNumber and enum
    expect(
      decodeRaidenState({
        address: '0xaddress',
        blockNumber: 123,
        tokenNetworks: {
          '0xtokenNetwork': {
            '0xpartner': {
              state: 'open',
              totalDeposit: '200',
              partnerDeposit: '210',
            },
          },
        },
        token2tokenNetwork: { '0xtoken': '0xtokenNetwork' },
      }),
    ).toEqual({
      address: '0xaddress',
      blockNumber: 123,
      tokenNetworks: {
        '0xtokenNetwork': {
          '0xpartner': {
            state: ChannelState.open,
            totalDeposit: bigNumberify(200),
            partnerDeposit: bigNumberify(210),
          },
        },
      },
      token2tokenNetwork: { '0xtoken': '0xtokenNetwork' },
    });
  });
});
