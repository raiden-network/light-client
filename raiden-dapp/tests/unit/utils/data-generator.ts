import { BigNumber, constants } from 'ethers';
import times from 'lodash/times';

import type { Address, RaidenChannel, RaidenTransfer } from 'raiden-ts';
import { ChannelState } from 'raiden-ts';

import type { Token } from '@/model/types';
import { NotificationContext } from '@/store/notifications/notification-context';
import { NotificationImportance } from '@/store/notifications/notification-importance';
import type { NotificationPayload } from '@/store/notifications/types';
import type { SuggestedPartner } from '@/types';

const HEXADECIMAL_CHARACTERS = '0123456789abcdefABCDEF';
const ALPHABET_CHARACTERS = 'abcdefghijklmnopqrstuvwxyz';
const NUMBER_CHARACTERS = '0123456789';

export const TRANSFER_DATES = [
  new Date('June 5, 1986 21:00:00:700'),
  new Date('June 5, 1986 22:00:00:900'),
  new Date('June 5, 1986 23:00:00:800'),
];

function getRandomString(charSet: string, length: number, prefix = ''): string {
  let output = prefix;

  times(length, () => {
    output += charSet.charAt(Math.floor(Math.random() * charSet.length));
  });

  return output;
}

function getRandomEthereumAddress(): string {
  return getRandomString(HEXADECIMAL_CHARACTERS, 32, '0x');
}

function getRandomTransactionKey(): string {
  return getRandomString(ALPHABET_CHARACTERS, 10);
}

function getRandomNumericId(): number {
  return +getRandomString(NUMBER_CHARACTERS, 5);
}

/**
 * @param partialToken - Token data override
 * @returns Token object
 */
export function generateToken(partialToken: Partial<Token> = {}): Token {
  return {
    address: getRandomEthereumAddress(),
    decimals: 18,
    name: 'TestToken',
    symbol: 'TTT',
    balance: constants.Zero,
    ...partialToken,
  } as Token;
}

/**
 * There is an inconsistent typing of token addresses. While the Token interface
 * of the dApp defines it as a string, the SDK defines the token address of
 * a RaidenTransfer as Address. Therefore it is not possible to simply use the
 * generateToken function and pass it's address to the partialTransfer
 * parameter. To circumvent this problem, the optional token parameter accepts
 * the Token type of the dApp and casts its address for the token within the to
 * generate transfer.
 *
 * @param partialTransfer - RaidenTransfer overrides
 * @param token - Token object
 * @returns RaidenTransfer mocked object
 */
export function generateTransfer(
  partialTransfer: Partial<RaidenTransfer> = {},
  token?: Token,
): RaidenTransfer {
  return {
    key: getRandomTransactionKey(),
    token: token ? (token.address as Address) : getRandomEthereumAddress(),
    amount: BigNumber.from(10 ** 8),
    changedAt: new Date('June 5, 1986 23:00:00'),
    direction: 'sent',
    partner: getRandomEthereumAddress(),
    initiator: getRandomEthereumAddress(),
    target: getRandomEthereumAddress(),
    success: undefined,
    ...partialTransfer,
  } as RaidenTransfer;
}

/**
 * @param partialChannel - RaidenChannel overrides
 * @param token - Token object
 * @returns RaidenChannel mocked object
 */
export function generateChannel(
  partialChannel: Partial<RaidenChannel> = {},
  token?: Token,
): RaidenChannel {
  return {
    id: getRandomNumericId(),
    openBlock: 1000,
    partner: '0x1D36124C90f53d491b6832F1c073F43E2550E35b' as Address,
    partnerDeposit: BigNumber.from(10 ** 8),
    settleTimeout: 500,
    state: ChannelState.open,
    token: token ? (token.address as Address) : getRandomEthereumAddress(),
    tokenNetwork: getRandomEthereumAddress(),
    ownDeposit: BigNumber.from(10 ** 8),
    balance: constants.Zero,
    capacity: BigNumber.from(10 ** 8),
    ownWithdrawable: BigNumber.from(10 ** 8),
    completed: true,
    ...partialChannel,
  } as RaidenChannel;
}

/**
 * @param partialPayload - NotificationPayload overrides
 * @returns NotificationPayload mocked object
 */
export function generateNotificationPayload(
  partialPayload: Partial<NotificationPayload> = {},
): NotificationPayload {
  return {
    title: 'Test Nofication',
    description: 'Used for unit tests',
    ...partialPayload,
  } as NotificationPayload;
}

/**
 * @param partialSuggestedPartner - SuggestedPartner overrides
 * @returns SuggestedPartner mocked object
 */
export function generateSuggestedPartner(
  partialSuggestedPartner: Partial<SuggestedPartner> = {},
): SuggestedPartner {
  return {
    address: '0x1D36124C90f53d491b6832F1c073F43E2550E35b',
    capacity: BigNumber.from(10 * 2),
    centrality: '0.0000',
    score: '0.0000',
    uptime: 788,
    ...partialSuggestedPartner,
  } as SuggestedPartner;
}

/**
 * @param partialNotification - NotificationPayload overrides
 * @returns NotificationPyalod mocked object
 */
export function generateNotification(
  partialNotification: Partial<NotificationPayload> = {},
): NotificationPayload {
  return {
    id: 1,
    title: 'Channel Settlement',
    description: 'Channel with 0x09123456789 was settled.',
    display: true,
    duration: 5000,
    importance: NotificationImportance.HIGH,
    context: NotificationContext.NONE,
    received: new Date('June 5, 1986'),
    ...partialNotification,
  } as NotificationPayload;
}

/**
 * @param partialActionProgressStep - ActionProgressStep overrides
 * @returns ActionProgressStep mocked object
 */
export function generateActionProgressStep(
  partialActionProgressStep: Partial<ActionProgressStep> = {},
): ActionProgressStep {
  return {
    title: 'test step',
    description: 'do test thingy',
    active: false,
    completed: false,
    failed: false,
    ...partialActionProgressStep,
  };
}
