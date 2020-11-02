import {
  makeMatrix,
  MockRaidenEpicDeps,
  MockedRaiden,
  makeAddress,
  makeHash,
  waitBlock,
  providersEmit,
  makeLog,
} from './mocks';

import { Subject } from 'rxjs';
import { exhaustMap, first, pluck, scan } from 'rxjs/operators';
import { Wallet } from '@ethersproject/wallet';
import { AddressZero, Zero, HashZero } from '@ethersproject/constants';
import { BigNumber } from '@ethersproject/bignumber';
import { defaultAbiCoder } from '@ethersproject/abi';

import { Address, Hash, Int, UInt, Secret } from 'raiden-ts/utils/types';
import { Processed, MessageType } from 'raiden-ts/messages/types';
import {
  makeMessageId,
  makePaymentId,
  makeSecret,
  getSecrethash,
  transferKey,
  getTransfer,
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
import { transfer, transferSecret, transferUnlock } from 'raiden-ts/transfers/actions';
import { assert } from 'raiden-ts/utils';
import { isResponseOf } from 'raiden-ts/utils/actions';
import { matrixPresence } from 'raiden-ts/transport/actions';

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
    fee = BigNumber.from(3) as Int<32>,
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
      chain_id: BigNumber.from(depsMock.network.chainId) as UInt<32>,
      expiration_block: BigNumber.from(3232341) as UInt<32>,
      amount: BigNumber.from(100) as UInt<32>,
    } as IOU,
    key = channelKey({ tokenNetwork, partner }),
    action$ = new Subject<RaidenAction>(),
    state$ = new Subject<RaidenState>();

  let initialState!: RaidenState;
  depsMock.latest$.pipe(pluckDistinct('state'), first()).subscribe((s) => (initialState = s));

  action$.pipe(scan((s, a) => raidenReducer(s, a), initialState)).subscribe(state$);
  getLatest$(action$, state$, depsMock).subscribe(depsMock.latest$);

  depsMock.registryContract.token_to_token_networks.mockImplementation(async (_token) =>
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
export const deposit = BigNumber.from(1000) as UInt<32>;
export const matrixServer = 'matrix.raiden.test';
export const secret = makeSecret();
export const secrethash = getSecrethash(secret);
export const amount = BigNumber.from(10) as UInt<32>;
export const fee = BigNumber.from(3) as Int<32>;

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
 * @param raiden - Raiden client to fetch transfer state from
 * @param key - { direction, secrethash } or transferKey
 * @param wait - Whether to wait for the transfer to be in state, or throw if it isn't
 * @returns Promise to TransferState
 */
export async function getOrWaitTransfer(
  raiden: MockedRaiden,
  key: { direction: Direction; secrethash: Hash } | string,
  wait: boolean | ((doc: TransferState) => boolean) = false,
): Promise<TransferState> {
  if (typeof key !== 'string') key = transferKey(key);
  return await raiden.deps.latest$
    .pipe(
      pluck('state'),
      exhaustMap((state) => getTransfer(state, raiden.deps.db, key).catch(() => undefined)),
      first((transfer): transfer is NonNullable<typeof transfer> => {
        if (!wait) {
          if (transfer) return true;
          else throw new Error('transfer not found');
        } else if (wait === true) return !!transfer;
        else {
          if (transfer) return wait(transfer);
          else return false;
        }
      }),
    )
    .toPromise();
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
 * @param opts - Options
 * @param opts.channelId - Channel id to use instead of default [id]
 */
export async function ensureChannelIsOpen(
  [raiden, partner]: [MockedRaiden, MockedRaiden],
  { channelId = id } = {},
): Promise<void> {
  await ensureTokenIsMonitored(raiden);
  await ensureTokenIsMonitored(partner);
  if (getChannel(raiden, partner)) return;
  const openBlock = raiden.deps.provider.blockNumber + 1;
  const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);
  await providersEmit(
    {},
    makeLog({
      transactionHash: makeHash(),
      blockNumber: openBlock,
      filter: tokenNetworkContract.filters.ChannelOpened(
        channelId,
        raiden.address,
        partner.address,
        null,
      ),
      data: defaultAbiCoder.encode(['uint256'], [settleTimeout]),
    }),
  );
  await waitBlock(openBlock);
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
  const id = getChannel(raiden, partner).id;
  const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);
  await providersEmit(
    {},
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
  const id = getChannel(raiden, partner).id;
  const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);
  await providersEmit(
    {},
    makeLog({
      transactionHash: makeHash(),
      blockNumber: closeBlock,
      filter: tokenNetworkContract.filters.ChannelClosed(id, raiden.address, 0, null),
      data: HashZero,
    }),
  );
  await waitBlock(closeBlock);
  await waitBlock(closeBlock + confirmationBlocks + 1); // confirmation
  if (raiden.started)
    assert(closedStates.includes(getChannel(raiden, partner)?.state), 'Raiden channel not closed');
  if (partner.started)
    assert(
      closedStates.includes(getChannel(partner, raiden)?.state),
      'Partner channel not closed',
    );
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
  const id = getChannel(raiden, partner).id;
  const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);
  await providersEmit(
    {},
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
  await waitBlock(settleBlock + confirmationBlocks + 1); // confirmation
  if (raiden.started) assert(!getChannel(raiden, partner), 'Raiden channel not settled');
  if (partner.started) assert(!getChannel(partner, raiden), 'Partner channel not settled');
}

/**
 * Ensure there's a pending sent transfer to partner
 *
 * @param clients - Clients tuple
 * @param clients.0 - Transfer sender node
 * @param clients.1 - Transfer receiver node
 * @param value - Amount to transfer
 * @param opts - Transfer options
 * @param opts.secrethash - Secrethash to use
 * @returns Promise to sent TransferState
 */
export async function ensureTransferPending(
  [raiden, partner]: [MockedRaiden, MockedRaiden],
  value = amount,
  { secrethash: secrethash_ }: { secrethash: Hash } = { secrethash },
): Promise<TransferState> {
  await ensureChannelIsDeposited([raiden, partner], value); // from partner to raiden
  try {
    return await getOrWaitTransfer(
      raiden,
      transferKey({ direction: Direction.SENT, secrethash: secrethash_ }),
    );
  } catch (e) {}

  const paymentId = makePaymentId();
  const sentPromise = getOrWaitTransfer(
    raiden,
    transferKey({ direction: Direction.SENT, secrethash: secrethash_ }),
    true,
  );
  raiden.store.dispatch(
    transfer.request(
      {
        tokenNetwork,
        target: partner.address,
        value,
        paths: [{ path: [partner.address], fee: Zero as Int<32> }],
        paymentId,
      },
      { secrethash: secrethash_, direction: Direction.SENT },
    ),
  );
  const sent = await sentPromise;

  await getOrWaitTransfer(
    partner,
    transferKey({ direction: Direction.RECEIVED, secrethash: secrethash_ }),
    true,
  );
  return sent;
}

/**
 * Ensure there's an unlocked transfer sent to partner
 *
 * @param clients - Clients tuple
 * @param clients.0 - Transfer sender node
 * @param clients.1 - Transfer receiver node
 * @param value - Value to transfer
 * @param opts - Transfer options
 * @param opts.secret - Secret to use
 * @returns Promise to sent TransferState
 */
export async function ensureTransferUnlocked(
  [raiden, partner]: [MockedRaiden, MockedRaiden],
  value = amount,
  { secret: secret_ }: { secret: Secret } = { secret },
): Promise<TransferState> {
  const secrethash = getSecrethash(secret_);
  await ensureTransferPending([raiden, partner], value, { secrethash }); // from partner to raiden
  try {
    if (
      (
        await getOrWaitTransfer(
          partner,
          transferKey({ direction: Direction.RECEIVED, secrethash }),
        )
      ).unlock
    )
      return await getOrWaitTransfer(
        raiden,
        transferKey({ direction: Direction.SENT, secrethash }),
      );
  } catch (e) {}

  const sentPromise = getOrWaitTransfer(
    raiden,
    transferKey({ direction: Direction.SENT, secrethash }),
    (doc) => !!doc.unlockProcessed,
  );
  raiden.store.dispatch(
    transferSecret({ secret: secret_ }, { secrethash, direction: Direction.SENT }),
  );
  raiden.store.dispatch(
    transferUnlock.request(undefined, { secrethash, direction: Direction.SENT }),
  );
  await sentPromise;

  await getOrWaitTransfer(
    partner,
    transferKey({ direction: Direction.RECEIVED, secrethash }),
    (doc) => !!doc.unlockProcessed,
  );
  return await sentPromise;
}

/**
 * @param clients - Clients tuple
 * @param clients.0 - We
 * @param clients.1 - Partner
 */
export async function ensurePresence([raiden, partner]: [MockedRaiden, MockedRaiden]): Promise<
  void
> {
  const raidenPromise = raiden.action$
    .pipe(first(isResponseOf(matrixPresence, { address: partner.address })))
    .toPromise();
  const partnerPromise = partner.action$
    .pipe(first(isResponseOf(matrixPresence, { address: raiden.address })))
    .toPromise();
  partner.store.dispatch(matrixPresence.request(undefined, { address: raiden.address }));
  raiden.store.dispatch(matrixPresence.request(undefined, { address: partner.address }));
  await Promise.all([raidenPromise, partnerPromise]);
}

/**
 * @param clients - Raiden Clients
 * @param clients.0 - Us
 * @param clients.1 - Partner
 */
export function expectChannelsAreInSync([raiden, partner]: [MockedRaiden, MockedRaiden]) {
  expect(getChannel(raiden, partner).own).toStrictEqual(getChannel(partner, raiden).partner);
  expect(getChannel(raiden, partner).partner).toStrictEqual(getChannel(partner, raiden).own);
}
