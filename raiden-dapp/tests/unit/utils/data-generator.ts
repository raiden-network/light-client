import times from 'lodash/times';
import { BigNumber } from 'ethers/utils';
import { Zero } from 'ethers/constants';
import {
  RaidenTransfer,
  Address,
  RaidenChannel,
  ChannelState,
} from 'raiden-ts';
import { Token } from '@/model/types';

const HEXADECIMAL_CHARACTERS = '0123456789abcdefABCDEF';
const ALPHABET_CHARACTERS = 'abcdefghijklmnopqrstuvwxyz';
const NUMBER_CHARACTERS = '0123456789';

function getRandomString(
  charSet: string,
  length: number,
  prefix: string = ''
): string {
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

export function generateToken(partialToken: Partial<Token> = {}): Token {
  return {
    address: getRandomEthereumAddress(),
    decimals: 18,
    name: 'TestToken',
    symbol: 'TTT',
    balance: Zero,
    ...partialToken,
  } as Token;
}

/*
 * There is an inconsistent typing of token addresses. While the Token interface
 * of the dApp defines it as a string, the SDK defines the token address of
 * a RaidenTransfer as Address. Therefore it is not possible to simply use the
 * generateToken function and pass it's address to the partialTransfer
 * parameter. To circumvent this problem, the optional token parameter accepts
 * the Token type of the dApp and casts its address for the token within the to
 * generate transfer.
 */
export function generateTransfer(
  partialTransfer: Partial<RaidenTransfer> = {},
  token?: Token
): RaidenTransfer {
  return {
    key: getRandomTransactionKey(),
    token: token ? (token.address as Address) : getRandomEthereumAddress(),
    amount: new BigNumber(10 ** 8),
    changedAt: new Date('June 5, 1986 23:59:59'),
    direction: 'sent',
    partner: getRandomEthereumAddress(),
    initiator: getRandomEthereumAddress(),
    target: getRandomEthereumAddress(),
    success: undefined,
    ...partialTransfer,
  } as RaidenTransfer;
}

export function generateChannel(
  partialChannel: Partial<RaidenChannel>,
  token?: Token
): RaidenChannel {
  return {
    id: getRandomNumericId(),
    openBlock: 1000,
    partner: '0x1D36124C90f53d491b6832F1c073F43E2550E35b' as Address,
    partnerDeposit: new BigNumber(10 ** 8),
    settleTimeout: 500,
    state: ChannelState.open,
    token: token ? (token.address as Address) : getRandomEthereumAddress(),
    tokenNetwork: getRandomEthereumAddress(),
    ownDeposit: new BigNumber(10 ** 8),
    balance: Zero,
    capacity: new BigNumber(10 ** 8),
    ownWithdrawable: new BigNumber(10 ** 8),
    ...partialChannel,
  } as RaidenChannel;
}
