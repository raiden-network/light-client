/* eslint-disable no-console */
import type { BigNumberish } from 'ethers';
import { ethers } from 'ethers';
import { promises as fs } from 'fs';
import inquirer from 'inquirer';
import yargs from 'yargs/yargs';

import type { Decodable, RaidenConfig } from 'raiden-ts';
import {
  Address,
  assert,
  decode,
  DEFAULT_PFS_IOU_TIMEOUT,
  DEFAULT_PFS_MAX_PATHS,
  DEFAULT_POLLING_INTERVAL,
  DEFAULT_REVEAL_TIMEOUT,
  PfsMode,
  UInt,
} from 'raiden-ts';

import DEFAULT_RAIDEN_CONFIG from './config.json';
import DISCLAIMER from './disclaimer.json';

type AddressToFeeValue = { [tokenAddress: string]: string };
type FeeType = 'flat' | 'proportional' | 'imbalance';
type MediationFeeConfigurationOfToken = { cap: boolean } & {
  [K in FeeType]?: BigNumberish;
};
type MediationFeeConfiguration = {
  [tokenAddress: string]: MediationFeeConfigurationOfToken;
};

async function checkDisclaimer(accepted?: boolean): Promise<void> {
  console.info(DISCLAIMER);
  if (accepted === undefined) {
    ({ accepted } = await inquirer.prompt<{ accepted: boolean }>([
      {
        type: 'confirm',
        name: 'accepted',
        message:
          'I have read, understood and hereby agree to the above Terms of Use, Privacy Policy including the Disclaimer and Privacy Warning',
        default: false,
      },
    ]));
  } else if (accepted) {
    console.info('Disclaimer accepted by command line parameter.');
  }
  assert(accepted, 'Disclaimer not accepted!');
}

function parseFeeOption(args?: readonly string[]): AddressToFeeValue {
  const parsedOption: AddressToFeeValue = {};

  if (!args?.length) return parsedOption;

  assert(args.length % 2 === 0, 'fees must have the format [address, number]');

  for (let i = 0; i < args.length; i += 2) {
    assert(Address.is(args[i]), `Invalid address: ${i} = ${args[i]}`);
    assert(args[i + 1].match(/^\d+$/), 'Invalid numeric value');
    parsedOption[args[i]] = args[i + 1];
  }

  return parsedOption;
}

function constructMediationFeeConfiguration(
  mediationFeeConfiguration: MediationFeeConfiguration = {},
  {
    capMediationFees,
    flatFee = {},
    proportionalFee = {},
    proportionalImbalanceFee = {},
  }: Pick<
    Awaited<ReturnType<typeof parseArguments>>,
    'capMediationFees' | 'flatFee' | 'proportionalFee' | 'proportionalImbalanceFee'
  >,
): MediationFeeConfiguration {
  for (const [address, value] of Object.entries(flatFee)) {
    mediationFeeConfiguration = {
      ...mediationFeeConfiguration,
      [address]: { ...mediationFeeConfiguration[address], flat: value },
    };
  }

  for (const [address, value] of Object.entries(proportionalFee)) {
    mediationFeeConfiguration = {
      ...mediationFeeConfiguration,
      [address]: { ...mediationFeeConfiguration[address], proportional: value },
    };
  }

  for (const [address, value] of Object.entries(proportionalImbalanceFee)) {
    mediationFeeConfiguration = {
      ...mediationFeeConfiguration,
      [address]: { ...mediationFeeConfiguration[address], imbalance: value },
    };
  }

  for (const [address, configurationOfToken] of Object.entries(mediationFeeConfiguration)) {
    mediationFeeConfiguration[address] = {
      ...mediationFeeConfiguration[ethers.constants.AddressZero],
      ...configurationOfToken,
      cap: capMediationFees,
    };
  }

  return mediationFeeConfiguration;
}

function parseEndpoint(url: string): [string, number] {
  const match = url.match(/^(?:\w+:\/\/)?([^\/]*):(\d+)$/);
  assert(match, 'Invalid endpoint');
  const [, host, port] = match;
  return [host || '127.0.0.1', +port];
}

const yargsOptions = {
  datadir: {
    type: 'string',
    default: './storage',
    desc: 'Dir path where to store state',
  },
  configFile: {
    type: 'string',
    desc: 'JSON file path containing config object',
    normalize: true,
  },
  keystorePath: {
    type: 'string',
    default: './',
    desc: 'Path for ethereum keystore directory',
    normalize: true,
  },
  address: {
    type: 'string',
    desc: 'Address of private key to use',
    check: Address.is,
  },
  passwordFile: {
    type: 'string',
    desc: 'Path for text file containing password for keystore file',
    normalize: true,
  },
  userDepositContractAddress: {
    type: 'string',
    desc: "Address of UserDeposit contract to use as contract's entrypoint; optionally, append ':<block>' to start scanning since this block",
  },
  acceptDisclaimer: {
    type: 'boolean',
    desc: 'By setting this parameter you confirm that you have read, understood and accepted the disclaimer, privacy warning and terms of use.',
  },
  blockchainQueryInterval: {
    type: 'number',
    default: DEFAULT_POLLING_INTERVAL,
    desc: 'Time interval after which to check for new blocks (in seconds)',
  },
  defaultRevealTimeout: {
    type: 'number',
    default: DEFAULT_REVEAL_TIMEOUT,
    desc: 'Default transfer reveal timeout',
  },
  ethRpcEndpoint: {
    type: 'string',
    default: 'http://127.0.0.1:8545',
    desc: 'Ethereum JSON RPC node endpoint to use for blockchain interaction',
  },
  logFile: {
    type: 'string',
    desc: 'Output all logs to this file instead of stdout/stderr',
    normalize: true,
  },
  matrixServer: {
    type: 'string',
    default: 'auto',
    desc: 'URL of Matrix Transport server',
  },
  rpc: {
    type: 'boolean',
    default: true,
    desc: 'Start with or without the RPC server',
  },
  rpccorsdomain: {
    type: 'string',
    default: 'http://localhost:*/*',
    desc: 'Comma separated list of domains to accept cross origin requests.',
  },
  apiAddress: {
    type: 'string',
    default: '127.0.0.1:5001',
    desc: 'host:port to bind to and listen for API requests',
    coerce: parseEndpoint,
  },
  routingMode: {
    choices: ['pfs', 'local', 'private'] as const,
    default: 'pfs',
    desc: 'Anything else than "pfs" disables mediated transfers',
  },
  pathfindingServiceAddress: {
    type: 'array',
    desc: 'Force given PFS URL list to be used, automatically chosing the first responding provider for transfers, instead of auto-selecting valid from "ServiceRegistry" contract',
  },
  pathfindingMaxPaths: {
    type: 'number',
    default: DEFAULT_PFS_MAX_PATHS,
    desc: 'Set maximum number of paths to be requested from the path finding service.',
  },
  pathfindingMaxFee: {
    type: 'string',
    default: '50000000000000000',
    desc: 'Set max fee per request paid to the path finding service.',
    coerce: (value: unknown) => decode(UInt(32), value),
  },
  pathfindingIouTimeout: {
    type: 'number',
    default: DEFAULT_PFS_IOU_TIMEOUT,
    desc: 'Number of blocks before a new IOU to the PFS expires.',
  },
  enableMonitoring: {
    type: 'boolean',
    default: false,
    desc: "Enables monitoring if there's a UDC deposit",
  },
  flatFee: {
    // this ensures addresses are not converted to numbers while preserving parseFeeOption return type
    string: true as boolean,
    nargs: 2,
    desc: 'Sets the flat fee required for every mediation in wei of the mediated token for a certain token address: [address value] pair',
    coerce: parseFeeOption,
  },
  proportionalFee: {
    string: true as boolean,
    nargs: 2,
    desc: 'Sets the proportional fee required for every mediation, in micros (parts per million, 1% = 10000) of the mediated token for a certain token address: [address value] pair',
    coerce: parseFeeOption,
  },
  proportionalImbalanceFee: {
    string: true as boolean,
    nargs: 2,
    desc: 'Sets the proportional imbalance fee penalty required for every mediation, in micros (parts per million, 1% = 10000) of the mediated token for a certain token address: [address value] pair',
    coerce: parseFeeOption,
  },
  capMediationFees: {
    type: 'boolean',
    default: true,
    desc: 'Enables capping mediation fees to not allow them to be negative (output transfers amount always less than or equal input transfers)',
  },
  gasPrice: {
    desc: "Set gasPrice factor for transactions's priority fees, as a multiplier of default `maxPriorityFeePerGas` (2.5 Gwei); some aliases: rpc=1.0, medium=1.05, fast=1.2, faster|rapid=1.5",
    coerce(val?: string | string[]): number | undefined {
      if (!val) return;
      if (Array.isArray(val)) val = val[val.length - 1];
      let value;
      switch (val) {
        case 'rpc':
          return 1.0;
        case 'medium':
          return 1.05;
        case 'fast':
          return 1.2;
        case 'faster':
        case 'rapid':
          return 1.5;
        default:
          value = +val;
          assert(value && value > 0, 'invalid gasPrice');
          return value;
      }
    },
  },
} as const;

/**
 * Parse Raiden CLI parameters
 *
 * @returns Parsed options
 */
export async function parseArguments() {
  const argv = yargs(process.argv.slice(2));
  const result = await argv
    .env('RAIDEN')
    .usage('Usage: $0 [options]')
    .options(yargsOptions)
    .help()
    .alias('h', 'help')
    .version()
    .alias('V', 'version').argv;
  await checkDisclaimer(result.acceptDisclaimer);
  return result;
}

/**
 * Create a (partial) Raiden config object from parsed CLI arguments
 *
 * @param argv - Parsed arguments
 * @returns Partial Raiden config
 */
export async function createRaidenConfig(
  argv: Awaited<ReturnType<typeof parseArguments>>,
): Promise<Partial<Decodable<RaidenConfig>>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let config: Partial<Decodable<RaidenConfig>> = DEFAULT_RAIDEN_CONFIG as any;

  if (argv.configFile)
    config = { ...config, ...JSON.parse(await fs.readFile(argv.configFile, 'utf-8')) };

  config = {
    ...config,
    pollingInterval: Math.floor(argv.blockchainQueryInterval * 1000),
    revealTimeout: argv.defaultRevealTimeout,
    pfsMaxPaths: argv.pathfindingMaxPaths,
    pfsMaxFee: argv.pathfindingMaxFee,
    pfsIouTimeout: argv.pathfindingIouTimeout,
    ...(argv.gasPrice ? { gasPriceFactor: argv.gasPrice } : undefined),
  };

  if (argv.matrixServer !== 'auto') config = { ...config, matrixServer: argv.matrixServer };

  if (argv.routingMode !== 'pfs') config = { ...config, pfsMode: PfsMode.disabled };
  else if (!argv.pathfindingServiceAddress) config = { ...config, pfsMode: PfsMode.auto };
  else
    config = {
      ...config,
      pfsMode: PfsMode.onlyAdditional,
      additionalServices: argv.pathfindingServiceAddress as string[],
    };

  if (!argv.enableMonitoring) config = { ...config, monitoringReward: null };

  const mediationFees = constructMediationFeeConfiguration(
    config.mediationFees as MediationFeeConfiguration | undefined,
    argv,
  );

  config = { ...config, mediationFees };

  return config;
}
