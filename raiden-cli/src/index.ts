/* eslint-disable no-console */
import type { BigNumberish } from 'ethers';
import { ethers, Wallet } from 'ethers';
import fs from 'fs';
import inquirer from 'inquirer';
import * as path from 'path';
import yargs from 'yargs/yargs';

import type { Decodable, RaidenConfig } from 'raiden-ts';
import { Address, assert, Capabilities, decode, PfsMode, Raiden, UInt } from 'raiden-ts';

import { makeCli } from './cli';
import DEFAULT_RAIDEN_CONFIG from './config.json';
import DISCLAIMER from './disclaimer.json';
import type { Cli } from './types';
import { setupLoglevel } from './utils/logging';

function parseFeeOption(args: readonly string[]) {
  assert(args.length && args.length % 2 === 0, 'fees must have the format [address, number]');
  const res: { [addr: string]: string } = {};
  for (let i = 0; i < args.length; i += 2) {
    assert(Address.is(args[i]), 'Invalid address');
    assert(args[i + 1].match(/^\d+$/), 'Invalid numeric value');
    res[args[i]] = args[i + 1];
  }
  return res;
}

function parseArguments() {
  const argv = yargs(process.argv.slice(2));
  return argv
    .env('RAIDEN')
    .usage('Usage: $0 [options]')
    .options({
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
        desc: "Address of UserDeposit contract to use as contract's entrypoint",
        check: Address.is,
      },
      acceptDisclaimer: {
        type: 'boolean',
        desc:
          'By setting this parameter you confirm that you have read, understood and accepted the disclaimer, privacy warning and terms of use.',
      },
      blockchainQueryInterval: {
        type: 'number',
        default: 5,
        desc: 'Time interval after which to check for new blocks (in seconds)',
      },
      defaultRevealTimeout: {
        type: 'number',
        default: 50,
        desc: 'Default transfer reveal timeout',
      },
      defaultSettleTimeout: {
        type: 'number',
        default: 500,
        desc: 'Default channel settle timeout',
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
      },
    })
    .options({
      routingMode: {
        choices: ['pfs', 'local', 'private'] as const,
        default: 'pfs',
        desc: 'Anything else than "pfs" disables mediated transfers',
      },
      pathfindingServiceAddress: {
        type: 'array',
        desc:
          'Force given PFS URL list to be used, automatically chosing the first responding provider for transfers, instead of auto-selecting valid from "ServiceRegistry" contract',
      },
      pathfindingMaxPaths: {
        type: 'number',
        default: 3,
        desc: 'Set maximum number of paths to be requested from the path finding service.',
      },
      pathfindingMaxFee: {
        type: 'string',
        default: '50000000000000000',
        coerce: (value) => decode(UInt(32), value),
        desc: 'Set max fee per request paid to the path finding service.',
      },
      pathfindingIouTimeout: {
        type: 'number',
        default: 200000,
        desc: 'Number of blocks before a new IOU to the path finding service expires.',
      },
      enableMonitoring: {
        type: 'boolean',
        default: false,
        desc: "Enables monitoring if there's a UDC deposit",
      },
      enableMediation: {
        type: 'boolean',
        default: false,
        desc: 'Enables support for mediated payments (unsupported).',
        hidden: true, // hidden from help because not officially supported
      },
      flatFee: {
        type: 'string',
        nargs: 2,
        desc:
          'Sets the flat fee required for every mediation in wei of the mediated token for a certain token address: [address value] pair',
        coerce: parseFeeOption,
      },
    })
    .help()
    .alias('h', 'help')
    .version()
    .alias('V', 'version').argv;
}

function getKeystoreAccounts(keystorePath: string): { [addr: string]: string[] } {
  const keys: { [addr: string]: string[] } = {};
  for (const filename of fs.readdirSync(keystorePath)) {
    try {
      const json = fs.readFileSync(path.join(keystorePath, filename), 'utf-8');
      const address = ethers.utils.getAddress(JSON.parse(json)['address']);
      if (!(address in keys)) keys[address] = [];
      keys[address].push(json);
    } catch (e) {}
  }
  return keys;
}

async function getWallet(
  keystoreDir: string,
  address?: string,
  passwordFile?: string,
): Promise<Wallet> {
  const keys = getKeystoreAccounts(keystoreDir);
  if (!Object.keys(keys).length)
    throw new Error(`No account found on keystore directory "${keystoreDir}"`);
  else if (!address)
    ({ address } = await inquirer.prompt<{ address: string }>([
      { type: 'list', name: 'address', message: 'Account:', choices: Object.keys(keys) },
    ]));
  else if (!(address in keys)) throw new Error(`Could not find keystore file for "${address}"`);

  let password;
  if (passwordFile) password = fs.readFileSync(passwordFile, 'utf-8').split('\n').shift()!;
  else
    ({ password } = await inquirer.prompt<{ password: string }>([
      { type: 'password', name: 'password', message: `[${address}] Password:`, mask: '*' },
    ]));

  let lastError;
  for (const json of keys[address]) {
    try {
      return await Wallet.fromEncryptedJson(json, password);
    } catch (err) {
      lastError = err;
      if (err?.message?.includes('invalid counter bytes size')) {
        const parsed = JSON.parse(json);
        // try to fix non-16-bytes [crypto.cipherparams.iv]
        keys[address].push(
          JSON.stringify({
            ...parsed,
            crypto: {
              ...parsed.crypto,
              cipherparams: {
                ...parsed.crypto.cipherparams,
                iv: (parsed.crypto.cipherparams.iv as string).padStart(32, '0'),
              },
            },
          }),
        );
      }
    }
  }

  throw (
    lastError ?? new Error(`Could not decrypt keystore for "${address}" with provided password`)
  );
}

function createDataDirectory(path: string): void {
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path);
  }
}

function unrefTimeout(timeout: number | NodeJS.Timeout) {
  if (typeof timeout === 'number') return;
  timeout.unref();
}

function shutdownServer(this: Cli): void {
  if (this.server?.listening) {
    this.log.info('Closing server...');
    this.server.close();
  }
  unrefTimeout(setTimeout(() => process.exit(0), 10000));
}

function shutdownRaiden(this: Cli): void {
  if (this.raiden.started) {
    this.log.info('Stopping raiden...');
    this.raiden.stop();
  } else {
    process.exit(1);
  }
}

function registerShutdownHooks(this: Cli): void {
  // raiden shutdown triggers server shutdown
  this.raiden.state$.subscribe({
    error: shutdownServer.bind(this),
    complete: shutdownServer.bind(this),
  });
  process.on('SIGINT', shutdownRaiden.bind(this));
  process.on('SIGTERM', shutdownRaiden.bind(this));
  // 'beforeExit' is emitted after all background tasks are finished;
  // we need to call process.exit explicitly in order to avoid 'wrtc'
  // cleanup from segfaulting the process
  process.on('beforeExit', (code) => {
    this.log.info('Exiting', code);
    process.exit(code);
  });
}

function createRaidenConfig(
  argv: ReturnType<typeof parseArguments>,
): Partial<Decodable<RaidenConfig>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let config: Partial<Decodable<RaidenConfig>> = DEFAULT_RAIDEN_CONFIG as any;

  if (argv.configFile)
    config = { ...config, ...JSON.parse(fs.readFileSync(argv.configFile, 'utf-8')) };

  config = {
    ...config,
    pollingInterval: Math.floor(argv.blockchainQueryInterval * 1000),
    revealTimeout: argv.defaultRevealTimeout,
    settleTimeout: argv.defaultSettleTimeout,
    pfsMaxPaths: argv.pathfindingMaxPaths,
    pfsMaxFee: argv.pathfindingMaxFee,
    pfsIouTimeout: argv.pathfindingIouTimeout,
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

  if (argv.enableMediation)
    config = {
      ...config,
      caps: {
        ...config.caps,
        [Capabilities.RECEIVE]: 1,
        [Capabilities.MEDIATE]: 1,
      },
    };

  let mediationFees: { [token: string]: { flat: BigNumberish } } = {};
  for (const [addr, flat] of Object.entries(argv.flatFee ?? {})) {
    mediationFees = { ...mediationFees, [addr]: { ...mediationFees[addr], flat } };
  }
  if (Object.keys(mediationFees).length) config = { ...config, mediationFees };

  return config;
}

const endpointRe = /^(?:\w+:\/\/)?([^\/]*):(\d+)$/;
function parseEndpoint(url: string): readonly [string, number] {
  const match = url.match(endpointRe);
  assert(match, 'Invalid endpoint');
  const [, host, port] = match;
  return [host || '127.0.0.1', +port];
}

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

async function main() {
  const argv = parseArguments();
  await checkDisclaimer(argv.acceptDisclaimer);
  const wallet = await getWallet(argv.keystorePath, argv.address, argv.passwordFile);
  setupLoglevel(argv.logFile);
  createDataDirectory(argv.datadir);
  const endpoint = parseEndpoint(argv.apiAddress);
  const config = createRaidenConfig(argv);

  const raiden = await Raiden.create(
    argv.ethRpcEndpoint,
    wallet.privateKey,
    { prefix: argv.datadir.endsWith('/') ? argv.datadir : argv.datadir + '/' },
    argv.userDepositContractAddress,
    config,
  );
  const cli = makeCli(raiden, endpoint, undefined, argv.rpccorsdomain);
  registerShutdownHooks.call(cli);
  cli.raiden.start();
}

main().catch((err) => {
  console.error('Main error:', err);
  process.exit(2);
});
