import { promises as fs } from 'fs';
import path from 'path';

import { bigNumberify } from 'ethers/utils';
import { Zero, AddressZero, HashZero, One } from 'ethers/constants';

import { ChannelState, BalanceProofZero } from 'raiden-ts/channels';
import {
  decodeRaidenState,
  encodeRaidenState,
  RaidenState,
  CURRENT_STATE_VERSION,
} from 'raiden-ts/state';
import { Address, UInt } from 'raiden-ts/utils/types';
import { makeDefaultConfig } from 'raiden-ts/config';
import { SignatureZero, LocksrootZero } from 'raiden-ts/constants';

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
        [`${partner}@${tokenNetwork}`]: {
          state: ChannelState.open,
          own: {
            address,
            deposit: bigNumberify(200) as UInt<32>,
            withdraw: Zero as UInt<32>,
            locks: [],
            balanceProof: BalanceProofZero,
            withdrawRequests: [],
            nextNonce: One as UInt<8>,
          },
          partner: {
            address: partner,
            deposit: bigNumberify(210) as UInt<32>,
            withdraw: Zero as UInt<32>,
            locks: [],
            balanceProof: BalanceProofZero,
            withdrawRequests: [],
            nextNonce: One as UInt<8>,
          },
          id: 17,
          settleTimeout: 500,
          openBlock: 121,
          isFirstParticipant: true,
          token,
          tokenNetwork,
        },
      },
      oldChannels: {},
      tokens: { [token]: tokenNetwork },
      transport: {},
      sent: {},
      received: {},
      iou: {},
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
        [`${partner}@${tokenNetwork}`]: {
          state: 'open',
          own: {
            address,
            deposit: '200',
            withdraw: '0',
            locks: [],
            balanceProof: {
              chainId: '0',
              tokenNetworkAddress: AddressZero,
              channelId: '0',
              nonce: '0',
              transferredAmount: '0',
              lockedAmount: '0',
              locksroot: LocksrootZero,
              additionalHash: HashZero,
              signature: SignatureZero,
            },
            withdrawRequests: [],
            nextNonce: '1',
          },
          partner: {
            address: partner,
            deposit: '210',
            withdraw: '0',
            locks: [],
            balanceProof: {
              chainId: '0',
              tokenNetworkAddress: AddressZero,
              channelId: '0',
              nonce: '0',
              transferredAmount: '0',
              lockedAmount: '0',
              locksroot: LocksrootZero,
              additionalHash: HashZero,
              signature: SignatureZero,
            },
            withdrawRequests: [],
            nextNonce: '1',
          },
          id: 17,
          settleTimeout: 500,
          openBlock: 121,
          isFirstParticipant: true,
          token,
          tokenNetwork,
        },
      },
      oldChannels: {},
      tokens: { [token]: tokenNetwork },
      transport: {},
      sent: {},
      received: {},
      iou: {},
      pendingTxs: [],
    });
  });

  test('decodeRaidenState', () => {
    // missing required properties
    expect(() => decodeRaidenState({ address })).toThrow();

    // property of wrong type
    expect(() => decodeRaidenState({ address: 123 })).toThrow();

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
        oldChannels: {},
        tokens: {},
        transport: {},
        sent: {},
        received: {},
        path: { iou: {} },
        pendingTxs: [],
      }),
    ).toThrow('Invalid value "unknownstate"');

    // success on deep BigNumber and enum
    expect(
      decodeRaidenState({
        address,
        version: CURRENT_STATE_VERSION,
        chainId,
        registry,
        blockNumber: 123,
        config: makeDefaultConfig({ network: { name: 'testnet', chainId } }),
        channels: {
          [`${partner}@${tokenNetwork}`]: {
            state: 'open',
            own: {
              address,
              deposit: '200',
              withdraw: '0',
              locks: [],
              balanceProof: {
                chainId: '0',
                tokenNetworkAddress: AddressZero,
                channelId: '0',
                nonce: '0',
                transferredAmount: '0',
                lockedAmount: '0',
                locksroot: LocksrootZero,
                additionalHash: HashZero,
                signature: SignatureZero,
              },
              withdrawRequests: [],
              nextNonce: '1',
            },
            partner: {
              address: partner,
              deposit: '210',
              withdraw: '0',
              locks: [],
              balanceProof: {
                chainId: '0',
                tokenNetworkAddress: AddressZero,
                channelId: '0',
                nonce: '0',
                transferredAmount: '0',
                lockedAmount: '0',
                locksroot: LocksrootZero,
                additionalHash: HashZero,
                signature: SignatureZero,
              },
              withdrawRequests: [],
              nextNonce: '1',
            },
            id: 17,
            settleTimeout: 500,
            openBlock: 121,
            isFirstParticipant: true,
            token,
            tokenNetwork,
          },
        },
        oldChannels: {},
        tokens: { [token]: tokenNetwork },
        transport: {},
        sent: {},
        received: {},
        iou: {},
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
        [`${partner}@${tokenNetwork}`]: {
          state: ChannelState.open,
          own: {
            address,
            deposit: bigNumberify(200),
            withdraw: Zero,
            locks: [],
            balanceProof: BalanceProofZero,
            withdrawRequests: [],
            nextNonce: One,
          },
          partner: {
            address: partner,
            deposit: bigNumberify(210),
            withdraw: Zero,
            locks: [],
            balanceProof: BalanceProofZero,
            withdrawRequests: [],
            nextNonce: One,
          },
          id: 17,
          settleTimeout: 500,
          openBlock: 121,
          isFirstParticipant: true,
          token,
          tokenNetwork,
        },
      },
      oldChannels: {},
      tokens: { [token]: tokenNetwork },
      transport: {},
      sent: {},
      received: {},
      iou: {},
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
