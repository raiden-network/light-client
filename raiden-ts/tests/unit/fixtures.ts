/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  makeMatrix,
  MockRaidenEpicDeps,
  MockedRaiden,
  makeAddress,
  makeHash,
  waitBlock,
  providersEmit,
  makeLog,
  sleep,
} from './mocks';

import { Subject } from 'rxjs';
import { first, scan, pluck } from 'rxjs/operators';
import { Wallet } from 'ethers';
import { AddressZero, Zero, HashZero } from 'ethers/constants';
import { bigNumberify, defaultAbiCoder } from 'ethers/utils';
import { Filter } from 'ethers/providers';

import { Address, Hash, Int, UInt } from 'raiden-ts/utils/types';
import { Processed, MessageType } from 'raiden-ts/messages/types';
import {
  makeMessageId,
  makePaymentId,
  makeSecret,
  getSecrethash,
} from 'raiden-ts/transfers/utils';
import { IOU } from 'raiden-ts/services/types';
import { RaidenState } from 'raiden-ts/state';
import { pluckDistinct } from 'raiden-ts/utils/rx';
import { RaidenAction } from 'raiden-ts/actions';
import { raidenReducer } from 'raiden-ts/reducer';
import { getLatest$ } from 'raiden-ts/epics';
import { channelKey } from 'raiden-ts/channels/utils';
import { tokenMonitored } from 'raiden-ts/channels/actions';
import { ChannelState, Channel } from 'raiden-ts/channels';
import { Direction, TransferState } from 'raiden-ts/transfers/state';
import { transfer, transferUnlock } from 'raiden-ts/transfers/actions';
import { messageReceived } from 'raiden-ts/messages/actions';
import { TokenNetwork } from 'raiden-ts/contracts/TokenNetwork';
import { assert } from 'raiden-ts/utils';

/**
 * Composes several constants used across epics
 *
 * @param depsMock - RaidenEpicDeps mock object constructed through raidenEpicDeps
 * @returns Diverse constant values and objects
 */
export function epicFixtures(depsMock: MockRaidenEpicDeps) {
  const wallet = new Wallet('0x3333333333333333333333333333333333333333333333333333333333333333'),
    token = '0x0000000000000000000000000000000000010001' as Address,
    tokenNetwork = '0x0000000000000000000000000000000000020001' as Address,
    partner = wallet.address as Address,
    target = '0x0100000000000000000000000000000000000005' as Address,
    tokenNetworkContract = depsMock.getTokenNetworkContract(tokenNetwork),
    tokenContract = depsMock.getTokenContract(token),
    settleTimeout = 500,
    channelId = 17,
    isFirstParticipant = true,
    matrixServer = 'matrix.raiden.test',
    userId = `@${depsMock.address.toLowerCase()}:${matrixServer}`,
    accessToken = 'access_token',
    deviceId = 'device_id',
    displayName = 'display_name',
    partnerRoomId = `!partnerRoomId:${matrixServer}`,
    partnerUserId = `@${partner.toLowerCase()}:${matrixServer}`,
    targetUserId = `@${target.toLowerCase()}:${matrixServer}`,
    matrix = makeMatrix(userId, matrixServer),
    txHash = '0x0000000000000000000000000000000000000020111111111111111111111111' as Hash,
    processed: Processed = { type: MessageType.PROCESSED, message_identifier: makeMessageId() },
    paymentId = makePaymentId(),
    fee = bigNumberify(3) as Int<32>,
    paths = [{ path: [partner], fee }],
    metadata = { routes: [{ route: [partner] }] },
    pfsAddress = '0x0900000000000000000000000000000000000009' as Address,
    pfsTokenAddress = '0x0800000000000000000000000000000000000008' as Address,
    pfsInfoResponse = {
      message: 'pfs message',
      network_info: {
        chain_id: depsMock.network.chainId,
        token_network_registry_address: depsMock.contractsInfo.TokenNetworkRegistry.address,
      },
      operator: 'pfs operator',
      payment_address: pfsAddress,
      price_info: 2,
      version: '0.4.1',
    },
    iou = {
      sender: depsMock.address,
      receiver: pfsAddress,
      one_to_n_address: '0x0A0000000000000000000000000000000000000a' as Address,
      chain_id: bigNumberify(depsMock.network.chainId) as UInt<32>,
      expiration_block: bigNumberify(3232341) as UInt<32>,
      amount: bigNumberify(100) as UInt<32>,
    } as IOU,
    key = channelKey({ tokenNetwork, partner }),
    action$ = new Subject<RaidenAction>(),
    state$ = new Subject<RaidenState>();

  let initialState!: RaidenState;
  depsMock.latest$.pipe(pluckDistinct('state'), first()).subscribe((s) => (initialState = s));

  action$.pipe(scan((s, a) => raidenReducer(s, a), initialState)).subscribe(state$);
  getLatest$(action$, state$, depsMock).subscribe(depsMock.latest$);

  depsMock.registryContract.functions.token_to_token_networks.mockImplementation(async (_token) =>
    _token === token ? tokenNetwork : AddressZero,
  );

  return {
    token,
    tokenNetwork,
    partner,
    target,
    matrix,
    channelId,
    settleTimeout,
    isFirstParticipant,
    tokenContract,
    tokenNetworkContract,
    accessToken,
    deviceId,
    displayName,
    partnerRoomId,
    partnerUserId,
    targetUserId,
    matrixServer,
    userId,
    txHash,
    state: initialState,
    partnerSigner: wallet,
    processed,
    paymentId,
    fee,
    paths,
    metadata,
    pfsAddress,
    pfsTokenAddress,
    pfsInfoResponse,
    iou,
    key,
    action$,
    state$,
  };
}

// fixture constants
export const token = makeAddress();
export const tokenNetwork = makeAddress();
export const settleTimeout = 60;
export const revealTimeout = 50;
export const confirmationBlocks = 5;
export const id = 17; // channelId
export const isFirstParticipant = true;
export const openBlock = 121;
export const closeBlock = openBlock + revealTimeout;
export const settleBlock = closeBlock + settleTimeout + 1;
export const txHash = makeHash();
export const deposit = bigNumberify(1000) as UInt<32>;
export const matrixServer = 'matrix.raiden.test';
export const secret = makeSecret();
export const secrethash = getSecrethash(secret);
export const amount = bigNumberify(10) as UInt<32>;

/**
 * Get channel state with partner for tokenNetwork
 *
 * @param raiden - Our instance
 * @param partner - Partner's client
 * @param partner.address - Partner's address
 * @param _tokenNetwork - token network for channel, defaults to fixture's tokenNetwork
 * @returns Channel with partner from raiden's perspective
 */
export function getChannel(
  raiden: MockedRaiden,
  partner: { address: Address },
  _tokenNetwork = tokenNetwork,
): Channel {
  return raiden.store.getState().channels[channelKey({ tokenNetwork: _tokenNetwork, partner })];
}

/**
 * Returns the filter used to monitor for channel events
 *
 * @param tokenNetworkContract - TokenNetwork contract
 * @returns Filter used to monitor TokenNetwork for Channel events
 */
export function getChannelEventsFilter(tokenNetworkContract: TokenNetwork): Filter {
  const events = tokenNetworkContract.interface.events;
  return {
    address: tokenNetworkContract.address,
    topics: [
      [
        events.ChannelOpened.topic,
        events.ChannelNewDeposit.topic,
        events.ChannelWithdraw.topic,
        events.ChannelClosed.topic,
        events.ChannelSettled.topic,
      ],
    ],
  };
}

/**
 * Ensure token is monitored on raiden's state
 *
 * @param raiden - Client instance
 */
export async function ensureTokenIsMonitored(raiden: MockedRaiden): Promise<void> {
  if (token in raiden.store.getState().tokens) return;
  raiden.store.dispatch(tokenMonitored({ token, tokenNetwork }));
}

/* eslint-disable jsdoc/valid-types */
/**
 * Ensure there's a channel open with partner
 *
 * @param clients - Clients tuple
 * @param clients.0 - Own raiden
 * @param clients.1 - Partner raiden to open channel with
 */
export async function ensureChannelIsOpen([raiden, partner]: [
  MockedRaiden,
  MockedRaiden,
]): Promise<void> {
  await ensureTokenIsMonitored(raiden);
  await ensureTokenIsMonitored(partner);
  if (getChannel(raiden, partner)) return;

  const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);
  await providersEmit(
    getChannelEventsFilter(tokenNetworkContract),
    makeLog({
      transactionHash: makeHash(),
      blockNumber: openBlock,
      filter: tokenNetworkContract.filters.ChannelOpened(
        id,
        raiden.address,
        partner.address,
        null,
      ),
      data: defaultAbiCoder.encode(['uint256'], [settleTimeout]),
    }),
  );
  await waitBlock(openBlock);
  await sleep(raiden.deps.provider.pollingInterval);
  await waitBlock(openBlock + confirmationBlocks + 1); // confirmation
  assert(getChannel(raiden, partner), 'Raiden channel not open');
  assert(getChannel(partner, raiden), 'Partner channel not open');
}

/**
 * Ensure there's a channel open with partner and it's funded
 *
 * @param clients - Clients tuple
 * @param clients.0 - Own raiden
 * @param clients.1 - Partner raiden to open channel with
 * @param totalDeposit - Deposit to perform
 */
export async function ensureChannelIsDeposited(
  [raiden, partner]: [MockedRaiden, MockedRaiden],
  totalDeposit: UInt<32> = deposit,
): Promise<void> {
  await ensureChannelIsOpen([raiden, partner]);
  if (getChannel(raiden, partner).own.deposit.gte(totalDeposit)) return;
  const txHash = makeHash();
  const txBlock = raiden.store.getState().blockNumber + 1;
  const participant = raiden.address;

  const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);
  await providersEmit(
    getChannelEventsFilter(tokenNetworkContract),
    makeLog({
      transactionHash: txHash,
      blockNumber: txBlock,
      filter: tokenNetworkContract.filters.ChannelNewDeposit(id, participant, null),
      data: defaultAbiCoder.encode(['uint256'], [totalDeposit]),
    }),
  );
  await waitBlock(txBlock);
  while (
    getChannel(raiden, partner).own.deposit.lt(totalDeposit) ||
    getChannel(partner, raiden).partner.deposit.lt(totalDeposit)
  ) {
    await waitBlock();
    await sleep(raiden.deps.provider.pollingInterval);
  }
}

/**
 * Ensure there's a channel open with partner
 *
 * @param clients - Clients tuple
 * @param clients.0 - Own raiden
 * @param clients.1 - Partner raiden to open channel with
 */
export async function ensureChannelIsClosed([raiden, partner]: [
  MockedRaiden,
  MockedRaiden,
]): Promise<void> {
  const closedStates = [ChannelState.closed, ChannelState.settleable, ChannelState.settling];
  await ensureChannelIsOpen([raiden, partner]);
  if (closedStates.includes(getChannel(raiden, partner).state)) return;
  const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);
  await providersEmit(
    getChannelEventsFilter(tokenNetworkContract),
    makeLog({
      transactionHash: makeHash(),
      blockNumber: closeBlock,
      filter: tokenNetworkContract.filters.ChannelClosed(id, raiden.address, 0, null),
      data: HashZero,
    }),
  );
  await waitBlock(closeBlock);
  await sleep(raiden.deps.provider.pollingInterval);
  await waitBlock(closeBlock + confirmationBlocks + 1); // confirmation
  assert(closedStates.includes(getChannel(raiden, partner)?.state), 'Raiden channel not closed');
  assert(closedStates.includes(getChannel(partner, raiden)?.state), 'Partner channel not closed');
}

/**
 * Ensure there's a channel open with partner
 *
 * @param clients - Clients tuple
 * @param clients.0 - Own raiden
 * @param clients.1 - Partner raiden to open channel with
 */
export async function ensureChannelIsSettled([raiden, partner]: [
  MockedRaiden,
  MockedRaiden,
]): Promise<void> {
  await ensureChannelIsClosed([raiden, partner]);
  if (!getChannel(raiden, partner)) return;
  const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);
  await providersEmit(
    getChannelEventsFilter(tokenNetworkContract),
    makeLog({
      transactionHash: makeHash(),
      blockNumber: settleBlock,
      filter: tokenNetworkContract.filters.ChannelSettled(id, null, null, null, null),
      data: defaultAbiCoder.encode(
        ['uint256', 'bytes32', 'uint256', 'bytes32'],
        [Zero, HashZero, Zero, HashZero],
      ),
    }),
  );
  await waitBlock(settleBlock);
  await sleep(raiden.deps.provider.pollingInterval);
  await waitBlock(settleBlock + confirmationBlocks + 1); // confirmation
  assert(!getChannel(raiden, partner), 'Raiden channel not settled');
  assert(!getChannel(partner, raiden), 'Partner channel not settled');
}

/**
 * Ensure there's a pending sent transfer to partner
 *
 * @param clients - Clients tuple
 * @param clients.0 - Transfer sender node
 * @param clients.1 - Transfer receiver node
 * @param value - Amount to transfer
 * @returns Promise to sent TransferState
 */
export async function ensureTransferPending(
  [raiden, partner]: [MockedRaiden, MockedRaiden],
  value = amount,
): Promise<TransferState> {
  await ensureChannelIsDeposited([raiden, partner], value); // from partner to raiden
  if (secrethash in partner.store.getState().received)
    return raiden.store.getState().sent[secrethash];

  const paymentId = makePaymentId();
  const sentPromise = raiden.deps.latest$
    .pipe(
      first(({ state }) => secrethash in state.sent),
      pluck('state', 'sent', secrethash),
    )
    .toPromise();
  raiden.store.dispatch(
    transfer.request(
      {
        tokenNetwork,
        target: partner.address,
        value,
        paths: [{ path: [partner.address], fee: Zero as Int<32> }],
        paymentId,
        secret,
      },
      { secrethash, direction: Direction.SENT },
    ),
  );
  const sent = await sentPromise;

  const receivedPromise = partner.deps.latest$
    .pipe(first(({ state }) => secrethash in state.received))
    .toPromise();
  partner.store.dispatch(
    messageReceived(
      { text: '', message: sent.transfer[1], ts: Date.now() },
      { address: raiden.address },
    ),
  );
  await receivedPromise;
  return sent;
}

/**
 * Ensure there's an unlocked transfer sent to partner
 *
 * @param clients - Clients tuple
 * @param clients.0 - Transfer sender node
 * @param clients.1 - Transfer receiver node
 * @param value - Value to transfer
 * @returns Promise to sent TransferState
 */
export async function ensureTransferUnlocked(
  [raiden, partner]: [MockedRaiden, MockedRaiden],
  value = amount,
): Promise<TransferState> {
  await ensureTransferPending([raiden, partner], value); // from partner to raiden
  if (partner.store.getState().received[secrethash]?.unlock)
    return partner.store.getState().received[secrethash];

  const sentPromise = raiden.deps.latest$
    .pipe(
      first(({ state }) => !!state.sent[secrethash]?.unlock),
      pluck('state', 'sent', secrethash),
    )
    .toPromise();
  raiden.store.dispatch(
    transferUnlock.request(undefined, { secrethash, direction: Direction.SENT }),
  );
  const sent = await sentPromise;

  const receivedPromise = partner.deps.latest$
    .pipe(first(({ state }) => !!state.received[secrethash]?.unlock))
    .toPromise();
  partner.store.dispatch(
    messageReceived(
      { text: '', message: sent.unlock![1], ts: Date.now() },
      { address: raiden.address },
    ),
  );
  await receivedPromise;
  return sent;
}
