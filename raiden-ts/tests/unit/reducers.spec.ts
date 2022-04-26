import { BigNumber } from '@ethersproject/bignumber';
import { AddressZero, Zero } from '@ethersproject/constants';
import { keccak256 } from '@ethersproject/keccak256';
import { getNetwork } from '@ethersproject/networks';
import { Wallet } from '@ethersproject/wallet';

import { raidenShutdown } from '@/actions';
import { ChannelState } from '@/channels';
import {
  channelClose,
  channelDeposit,
  channelOpen,
  channelSettle,
  channelSettleable,
  channelWithdrawn,
  newBlock,
  tokenMonitored,
} from '@/channels/actions';
import { channelKey, channelUniqueKey } from '@/channels/utils';
import { ShutdownReason } from '@/constants';
import { raidenReducer } from '@/reducer';
import { iouClear, iouPersist } from '@/services/actions';
import { signIOU } from '@/services/utils';
import type { RaidenState } from '@/state';
import { makeInitialState } from '@/state';
import { matrixSetup } from '@/transport/actions';
import { ErrorCodes, RaidenError } from '@/utils/error';
import type { Address, Hash, UInt } from '@/utils/types';

import { makeAddress } from '../utils';

describe('raidenReducer', () => {
  let state: RaidenState;
  const address = '0x0000000000000000000000000000000000000001' as Address,
    token = '0x0000000000000000000000000000000000010001' as Address,
    tokenNetwork = '0x0000000000000000000000000000000000020001' as Address,
    partner = '0x0000000000000000000000000000000000000020' as Address,
    txHash = '0x0000000000000000000000000000000000000020111111111111111111111111' as Hash,
    channelId = 17,
    fromBlock = 1,
    settleTimeout = 500,
    openBlock = 5123,
    closeBlock = 5999,
    settleBlock = closeBlock + settleTimeout + 1,
    isFirstParticipant = true;
  const key = channelKey({ tokenNetwork, partner });

  beforeEach(() => {
    state = makeInitialState(
      {
        network: getNetwork('unspecified'),
        address,
        contractsInfo: {
          TokenNetworkRegistry: { address: AddressZero as Address, block_number: 0 },
          ServiceRegistry: { address: AddressZero as Address, block_number: 0 },
          UserDeposit: { address: AddressZero as Address, block_number: 0 },
          SecretRegistry: { address: AddressZero as Address, block_number: 0 },
          MonitoringService: { address: AddressZero as Address, block_number: 0 },
          OneToN: { address: AddressZero as Address, block_number: 0 },
        },
      },
      { blockNumber: 1337 },
    );
  });

  test('newBlock', () => {
    const newState = raidenReducer(state, newBlock({ blockNumber: state.blockNumber + 1 }));
    expect(newState).toMatchObject({ blockNumber: state.blockNumber + 1 });
  });

  test('unhandled state change returns same object', () => {
    const newState = raidenReducer(state, raidenShutdown({ reason: ShutdownReason.STOP }));
    expect(newState).toEqual(state);
  });

  describe('tokenMonitored', () => {
    test('new tokenMonitored', () => {
      const newState = raidenReducer(state, tokenMonitored({ token, tokenNetwork, fromBlock }));
      expect(newState).toMatchObject({ tokens: { [token]: tokenNetwork } });
    });

    test('already monitored token', () => {
      state = {
        ...state,
        tokens: { [token]: tokenNetwork },
      };
      const newState = raidenReducer(state, tokenMonitored({ token, tokenNetwork, fromBlock }));
      expect(newState).toEqual(state);
    });
  });

  describe('channelOpen', () => {
    test('new channelOpen is not persisted', () => {
      const newState = raidenReducer(state, channelOpen.request({}, { tokenNetwork, partner }));
      expect(newState.channels).toStrictEqual({});
    });

    test('channelOpen.success unconfirmed', () => {
      const newState = raidenReducer(
        state,
        channelOpen.success(
          {
            id: channelId,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: undefined,
          },
          { tokenNetwork, partner },
        ),
      );
      expect(newState.channels).toStrictEqual({});
    });

    test('channelOpen.success confirmed', () => {
      const newState = raidenReducer(
        state,
        channelOpen.success(
          {
            id: channelId,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      );
      expect(newState.channels).toMatchObject({
        [key]: {
          state: ChannelState.open,
          own: { address, deposit: Zero },
          partner: { address: partner, deposit: Zero },
          id: channelId,
          openBlock,
          token,
          tokenNetwork,
        },
      });
    });

    test('channelOpen.failure', () => {
      const error = new RaidenError(ErrorCodes.CNL_OPENCHANNEL_FAILED);
      const newState = [
        channelOpen.request({}, { tokenNetwork, partner }),
        channelOpen.failure(error, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
      expect(newState.channels).toStrictEqual({});
    });
  });

  describe('channelDeposit success', () => {
    beforeEach(() => {
      state = raidenReducer(
        state,
        channelOpen.success(
          {
            id: channelId,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      );
    });

    test('channel not in open state', () => {
      state = [
        channelClose.success(
          { id: channelId, participant: partner, txHash, txBlock: closeBlock, confirmed: true },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      const newState = [
        channelDeposit.success(
          {
            id: channelId,
            participant: state.address,
            totalDeposit: BigNumber.from(23) as UInt<32>,
            txHash,
            txBlock: openBlock + 1,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      expect(newState).toEqual(state);
    });

    test('own deposit successful', () => {
      const deposit = BigNumber.from(25) as UInt<32>;
      const newState = raidenReducer(
        state,
        channelDeposit.success(
          {
            id: channelId,
            participant: address,
            totalDeposit: deposit,
            txHash,
            txBlock: openBlock + 1,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      );
      expect(newState.channels).toMatchObject({
        [key]: {
          state: ChannelState.open,
          own: { deposit: deposit }, // our total deposit was updated
          partner: { deposit: Zero },
          id: channelId,
        },
      });
    });

    test('partner deposit successful', () => {
      const deposit = BigNumber.from(26) as UInt<32>;
      const newState = raidenReducer(
        state,
        channelDeposit.success(
          {
            id: channelId,
            participant: partner,
            totalDeposit: deposit,
            txHash,
            txBlock: openBlock + 2,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      );
      expect(newState.channels).toMatchObject({
        [key]: {
          state: ChannelState.open,
          own: { deposit: Zero },
          partner: { deposit: deposit }, // partner's total deposit was updated
          id: channelId,
        },
      });
    });
  });

  describe('channelWithdrawn', () => {
    const deposit = BigNumber.from(500) as UInt<32>;

    beforeEach(() => {
      state = [
        channelOpen.success(
          {
            id: channelId,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
        channelDeposit.success(
          {
            id: channelId,
            participant: state.address,
            totalDeposit: deposit,
            txHash,
            txBlock: openBlock + 1,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
        channelDeposit.success(
          {
            id: channelId,
            participant: partner,
            totalDeposit: deposit,
            txHash,
            txBlock: openBlock + 2,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
    });

    test('channel not in open state', () => {
      // put channel in 'closed' state
      const closedState = raidenReducer(
        state,
        channelClose.success(
          {
            id: channelId,
            participant: state.address,
            txHash,
            txBlock: closeBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      );
      // try to apply action/state change
      const newState = raidenReducer(
        closedState,
        channelWithdrawn(
          {
            id: channelId,
            participant: state.address,
            totalWithdraw: BigNumber.from(23) as UInt<32>,
            txHash,
            txBlock: openBlock + 2,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      );
      // if channel is not open, action is noop and new state must be the previous one
      expect(newState).toBe(closedState);
    });

    test('own withdraw successful', () => {
      const withdraw = BigNumber.from(25) as UInt<32>;
      const newState = raidenReducer(
        state,
        channelWithdrawn(
          {
            id: channelId,
            participant: address,
            totalWithdraw: withdraw,
            txHash,
            txBlock: openBlock + 2,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      );
      expect(newState.channels).toMatchObject({
        [key]: {
          state: ChannelState.open,
          own: { deposit, withdraw }, // our totalWithdraw was updated
          partner: { deposit },
          id: channelId,
        },
      });
    });

    test('partner withdraw successful', () => {
      const withdraw = BigNumber.from(26) as UInt<32>;
      const newState = raidenReducer(
        state,
        channelWithdrawn(
          {
            id: channelId,
            participant: partner,
            totalWithdraw: withdraw,
            txHash,
            txBlock: openBlock + 2,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      );
      expect(newState.channels).toMatchObject({
        [key]: {
          state: ChannelState.open,
          own: { deposit },
          partner: { deposit, withdraw }, // partner's totalWithdraw was updated
          id: channelId,
        },
      });
    });
  });

  describe('channelClose', () => {
    beforeEach(() => {
      // channel in open state
      state = raidenReducer(
        state,
        channelOpen.success(
          {
            id: channelId,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      );
    });

    test('channel not in open state', () => {
      state = [
        channelClose.success(
          { id: channelId, participant: partner, txHash, txBlock: closeBlock, confirmed: true },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      const newState = raidenReducer(
        state,
        channelClose.request(undefined, { tokenNetwork, partner }),
      );
      expect(newState).toBe(state);
    });

    test('unknown channel', () => {
      const newState = raidenReducer(
        state,
        channelClose.request(undefined, { tokenNetwork, partner: token }),
      );
      expect(newState).toBe(state);
    });

    test('channelClose.request puts channel in closing state', () => {
      const newState = raidenReducer(
        state,
        channelClose.request(undefined, { tokenNetwork, partner }),
      );
      expect(newState.channels).toMatchObject({
        [key]: { state: ChannelState.closing, id: channelId },
      });
    });
  });

  describe('channelClose.success', () => {
    beforeEach(() => {
      // channel in open state
      state = raidenReducer(
        state,
        channelOpen.success(
          {
            id: channelId,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      );
    });

    test('unknown channel', () => {
      const newState = raidenReducer(
        state,
        channelClose.success(
          {
            id: channelId + 1,
            participant: address,
            txHash,
            txBlock: closeBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      );
      expect(newState).toBe(state);
    });

    test('channelClose.success unconfirmed puts channel in closing state, removed noop', () => {
      const newState = [
        channelClose.success(
          {
            id: channelId,
            participant: address,
            txHash,
            txBlock: closeBlock,
            confirmed: undefined,
          },
          { tokenNetwork, partner },
        ),
        channelClose.success(
          {
            id: channelId,
            participant: address,
            txHash,
            txBlock: closeBlock,
            confirmed: false,
          },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      expect(newState.channels).toMatchObject({
        [key]: { state: ChannelState.closing, id: channelId },
      });
    });

    test('channelClose.success confirmed puts channel in closed state', () => {
      const newState = raidenReducer(
        state,
        channelClose.success(
          { id: channelId, participant: address, txHash, txBlock: closeBlock, confirmed: true },
          { tokenNetwork, partner },
        ),
      );
      expect(newState.channels).toMatchObject({
        [key]: { state: ChannelState.closed, id: channelId, closeBlock },
      });
    });
  });

  describe('channelClose.failure', () => {
    beforeEach(() => {
      // channel in closing state
      state = [
        channelOpen.success(
          {
            id: channelId,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
        channelClose.request(undefined, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
    });

    test('unknown channel', () => {
      const newState = raidenReducer(
        state,
        channelClose.request(undefined, { tokenNetwork, partner: token }),
      );
      expect(newState).toEqual(state);
    });

    test('channelClose.failure revert closing to open', () => {
      const newState = raidenReducer(
        state,
        channelClose.failure(new RaidenError(ErrorCodes.CNL_CLOSECHANNEL_FAILED), {
          tokenNetwork,
          partner,
        }),
      );
      expect(newState.channels).toMatchObject({
        [key]: { state: ChannelState.open, id: channelId },
      });
    });
  });

  describe('channelSettleable', () => {
    beforeEach(() => {
      // channel in "open" state
      state = [
        channelOpen.success(
          {
            id: channelId,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
    });

    test('unknown channel', () => {
      state = [
        channelClose.success(
          { id: channelId, participant: address, txHash, txBlock: closeBlock, confirmed: true },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
      ].reduce(raidenReducer, state);
      const newState = [
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner: token }),
      ].reduce(raidenReducer, state);
      expect(newState).toEqual(state);
    });

    test('channel not in "closed" state', () => {
      state = [newBlock({ blockNumber: settleBlock })].reduce(raidenReducer, state);
      const newState = [
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
      expect(newState).toEqual(state);
    });

    test('channel.state becomes "settleable" `settleTimeout` blocks after closeBlock', () => {
      const newState = [
        channelClose.success(
          { id: channelId, participant: address, txHash, txBlock: closeBlock, confirmed: true },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
      expect(newState.channels).toMatchObject({
        [key]: { state: ChannelState.settleable, id: channelId },
      });
    });
  });

  describe('channelSettle.request & channelSettle.failure', () => {
    beforeEach(() => {
      // channel in "closed" state
      state = [
        channelOpen.success(
          {
            id: channelId,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
        channelClose.success(
          { id: channelId, participant: address, txHash, txBlock: closeBlock, confirmed: true },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
      ].reduce(raidenReducer, state);
    });

    test('unknown channel', () => {
      state = [
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
      const newState = [
        // no channel with partner=token
        channelSettle.request(undefined, { tokenNetwork, partner: token }),
      ].reduce(raidenReducer, state);
      expect(newState).toEqual(state);
    });

    test('channel not in "settleable" state', () => {
      // still in "closed" state
      const newState = [channelSettle.request(undefined, { tokenNetwork, partner })].reduce(
        raidenReducer,
        state,
      );
      expect(newState).toEqual(state);
    });

    test('channel.state becomes "settling" after "channelSettle.request"', () => {
      const newState = [
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner }),
        channelSettle.request(undefined, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
      expect(newState.channels).toMatchObject({
        [key]: { state: ChannelState.settling, id: channelId },
      });
    });

    test("channelSettle.failure doesn't change state", () => {
      const newState = [
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner }),
        channelSettle.request(undefined, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
      const error = new RaidenError(ErrorCodes.CNL_SETTLE_FAILED);
      const newState2 = raidenReducer(
        newState,
        channelSettle.failure(error, { tokenNetwork, partner }),
      );
      expect(newState2).toEqual(newState);
    });
  });

  describe('channelSettle.success', () => {
    beforeEach(() => {
      // channel starts in "opened" state
      state = [
        channelOpen.success(
          {
            id: channelId,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
    });

    test('unknown channel', () => {
      state = [
        channelClose.success(
          { id: channelId, participant: address, txHash, txBlock: closeBlock, confirmed: true },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
      ].reduce(raidenReducer, state);
      const newState = [
        // no channel with partner=token
        channelSettle.success(
          { id: channelId, txHash, txBlock: settleBlock, confirmed: true },
          { tokenNetwork, partner: token },
        ),
      ].reduce(raidenReducer, state);
      expect(newState).toEqual(state);
    });

    test('unconfirmed settle => "settling", removed noop', () => {
      const newState = [
        channelClose.success(
          { id: channelId, participant: address, txHash, txBlock: closeBlock, confirmed: true },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
        channelSettle.success(
          { id: channelId, txHash, txBlock: settleBlock, confirmed: undefined },
          { tokenNetwork, partner },
        ),
        channelSettle.success(
          { id: channelId, txHash, txBlock: settleBlock, confirmed: false },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      expect(newState.channels[key].state).toBe(ChannelState.settling);
    });

    test('success: "closed" => gone', () => {
      const newState = [
        channelClose.success(
          { id: channelId, participant: address, txHash, txBlock: closeBlock, confirmed: true },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
        channelSettle.success(
          { id: channelId, txHash, txBlock: settleBlock, confirmed: true },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      expect(newState.channels[key]).toBeUndefined();
      expect(
        newState.oldChannels[channelUniqueKey({ id: channelId, tokenNetwork, partner })],
      ).toMatchObject({
        state: ChannelState.settled,
        id: channelId,
        settleBlock,
      });
    });

    test('success: "settleable" => gone', () => {
      const newState = [
        channelClose.success(
          { id: channelId, participant: address, txHash, txBlock: closeBlock, confirmed: true },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner }),
        newBlock({ blockNumber: settleBlock + 1 }),
        channelSettle.success(
          { id: channelId, txHash, txBlock: settleBlock + 1, confirmed: true },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      expect(newState.channels[key]).toBeUndefined();
      expect(
        newState.oldChannels[channelUniqueKey({ id: channelId, tokenNetwork, partner })],
      ).toMatchObject({
        state: ChannelState.settled,
        id: channelId,
        settleBlock: settleBlock + 1,
      });
    });

    test('success: "settling" => gone', () => {
      const newState = [
        channelClose.success(
          { id: channelId, participant: address, txHash, txBlock: closeBlock, confirmed: true },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner }),
        newBlock({ blockNumber: settleBlock + 1 }),
        channelSettle.request(undefined, { tokenNetwork, partner }), // state=settling
        newBlock({ blockNumber: settleBlock + 2 }),
        channelSettle.success(
          { id: channelId, txHash, txBlock: settleBlock + 2, confirmed: true },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      expect(newState.channels[key]).toBeUndefined();
      expect(
        newState.oldChannels[channelUniqueKey({ id: channelId, tokenNetwork, partner })],
      ).toMatchObject({
        state: ChannelState.settled,
        id: channelId,
        settleBlock: settleBlock + 2,
      });
    });
  });

  describe('matrix', () => {
    test('matrixSetup', () => {
      const server = 'http://matrix.raiden.tld',
        setup = {
          userId: '@0xmyaddress:matrix.raiden.tld',
          accessToken: 'access_token_123',
          deviceId: 'mydevice',
          displayName: '0xuserIdSignature',
        };
      const newState = [matrixSetup({ server, setup })].reduce(raidenReducer, state);
      expect(newState.transport.server).toBe(server);
      expect(newState.transport.setup).toEqual(setup);
    });
  });

  describe('pendingTxs', () => {
    const pending = channelDeposit.success(
      {
        id: channelId,
        participant: partner,
        totalDeposit: BigNumber.from(12) as UInt<32>,
        txHash,
        txBlock: openBlock + 2,
        confirmed: undefined,
      },
      { tokenNetwork, partner },
    );

    test('pending action added to queue', () => {
      expect(state.pendingTxs).toEqual([]);
      expect(raidenReducer(state, pending).pendingTxs).toEqual([pending]);
    });

    test('confirmed tx cleans pending', () => {
      const pendingState = raidenReducer(state, pending);
      const confirmed = { ...pending, payload: { ...pending.payload, confirmed: true } };
      expect(raidenReducer(pendingState, confirmed).pendingTxs).toEqual([]);
    });

    test("confirmed tx doesn't clean other pending txs on same channel", () => {
      const pending2 = {
        ...pending,
        payload: { ...pending.payload, txHash: keccak256(txHash) as Hash, txBlock: openBlock + 3 },
      };
      const pendingState = [pending, pending2].reduce(raidenReducer, state);
      expect(pendingState.pendingTxs).toEqual([pending, pending2]);

      const confirmed = { ...pending, payload: { ...pending.payload, confirmed: true } };
      expect(raidenReducer(pendingState, confirmed).pendingTxs).toEqual([pending2]);
    });

    test('noop action returns same object', () => {
      // no pending in state for this confirmation == noop
      const confirmed = { ...pending, payload: { ...pending.payload, confirmed: true } };
      expect(raidenReducer(state, confirmed).pendingTxs).toBe(state.pendingTxs);
    });
  });

  test('iou persist and clear', async () => {
    expect.assertions(2);

    const signer = new Wallet(txHash);
    const address = signer.address as Address;
    const pfsAddress = makeAddress();
    const iou = {
      sender: address,
      receiver: pfsAddress,
      one_to_n_address: '0x0A0000000000000000000000000000000000000a' as Address,
      chain_id: BigNumber.from(1337) as UInt<32>,
      claimable_until: BigNumber.from(3232341) as UInt<32>,
      amount: BigNumber.from(100) as UInt<32>,
    };
    const signedIou = await signIOU(signer, iou);
    const newState = raidenReducer(
      state,
      iouPersist({ iou: signedIou }, { tokenNetwork, serviceAddress: iou.receiver }),
    );

    expect(newState.iou).toMatchObject({
      [tokenNetwork]: {
        [iou.receiver]: iou,
      },
    });

    const lastState = raidenReducer(
      newState,
      iouClear(undefined, { tokenNetwork, serviceAddress: iou.receiver }),
    );

    expect(lastState.iou).toMatchObject({
      [tokenNetwork]: {},
    });
  });
});
