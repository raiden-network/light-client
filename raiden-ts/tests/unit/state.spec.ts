import { promises as fs } from 'fs';
import path from 'path';

import { bigNumberify } from 'ethers/utils';

import { ChannelState } from 'raiden-ts/channels';
import {
  decodeRaidenState,
  encodeRaidenState,
  RaidenState,
  CURRENT_STATE_VERSION,
} from 'raiden-ts/state';
import { Address, UInt } from 'raiden-ts/utils/types';
import { makeDefaultConfig } from 'raiden-ts/config';

describe('RaidenState codecs', () => {
  const address = '0x1111111111111111111111111111111111111111' as Address,
    token = '0x0000000000000000000000000000000000010001' as Address,
    tokenNetwork = '0x0000000000000000000000000000000000020001' as Address,
    partner = '0x0000000000000000000000000000000000000020' as Address,
    chainId = 1338,
    registry = '0x0000000000000000000000000000000000000070' as Address;

  test('encodeRaidenState', () => {
    const state: RaidenState = {
      address,
      version: CURRENT_STATE_VERSION,
      chainId,
      registry,
      blockNumber: 123,
      config: makeDefaultConfig({ network: { name: 'testnet', chainId } }),
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
      path: { iou: {} },
      pendingTxs: [],
    };
    expect(JSON.parse(encodeRaidenState(state))).toEqual({
      address,
      version: CURRENT_STATE_VERSION,
      chainId,
      registry,
      blockNumber: 123,
      config: expect.anything(),
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
      path: { iou: {} },
      pendingTxs: [],
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
        chainId,
        registry,
        blockNumber: 123,
        config: makeDefaultConfig({ network: { name: 'testnet', chainId } }),
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
        path: { iou: {} },
        pendingTxs: [],
      }),
    ).toThrow('Invalid value "unknownstate"');

    // success on deep BigNumber and enum
    expect(
      decodeRaidenState({
        address,
        // no version, expect migration to add it
        chainId,
        registry,
        blockNumber: 123,
        config: makeDefaultConfig({ network: { name: 'testnet', chainId } }),
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
        path: { iou: {} },
        pendingTxs: [],
      }),
    ).toEqual({
      address,
      version: CURRENT_STATE_VERSION,
      chainId,
      registry,
      blockNumber: 123,
      config: expect.anything(),
      channels: {
        [tokenNetwork]: {
          [partner]: {
            state: ChannelState.open,
            own: { deposit: bigNumberify(200) },
            partner: { deposit: bigNumberify(210) },
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
      path: { iou: {} },
      pendingTxs: [],
    });
  });
});

test('migrations', async () => {
  // iterate over past stored JSON states & ensure they can be migrated to current
  const dir = path.join(path.dirname(await fs.realpath(__filename)), 'states');
  const states = await fs.readdir(dir);
  for (const file of states) {
    if (!file.toLowerCase().endsWith('json')) continue;
    const json = await fs.readFile(path.join(dir, file), { encoding: 'utf-8' });
    console.info('decoding', file);
    const decoded = decodeRaidenState(json);
    expect(RaidenState.is(decoded)).toBe(true);
  }
});
