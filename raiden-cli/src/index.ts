import { promises as fs } from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
import yargs from 'yargs/yargs';
import { LocalStorage } from 'node-localstorage';
import { Wallet, ethers } from 'ethers';
import { Raiden, Address, RaidenConfig, assert, UInt } from 'raiden-ts';

import DISCLAIMER from './disclaimer.json';
import DEFAULT_RAIDEN_CONFIG from './config.json';
import { Cli } from './types';
import { makeCli } from './cli';
import { setupLoglevel } from './utils/logging';

function parseArguments() {
  const argv = yargs(process.argv.slice(2));
  return argv
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
          'By setting this parameter you confirm that you have read, understood and accepted the disclaimer and privacy warning.',
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
        type: 'string',
        default: 'auto',
        desc: 'Force a given PFS to be used; "auto" selects cheapest registered on-chain',
      },
      pathfindingMaxPaths: {
        type: 'number',
        default: 3,
        desc: 'Set maximum number of paths to be requested from the path finding service.',
      },
      pathfindingMaxFee: {
        type: 'string',
        // cast to fool TypeScript on type of argv.pathfindingMaxFee, decoded by Raiden.create
        default: ('50000000000000000' as unknown) as UInt<32>,
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
    })
    .env('RAIDEN')
    .help()
    .alias('h', 'help')
    .version()
    .alias('V', 'version').argv;
}

async function getKeystoreAccounts(keystorePath: string): Promise<{ [addr: string]: string[] }> {
  const keys: { [addr: string]: string[] } = {};
  for (const filename of await fs.readdir(keystorePath)) {
    try {
      const json = await fs.readFile(path.join(keystorePath, filename), 'utf-8');
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
  const keys = await getKeystoreAccounts(keystoreDir);
  if (!Object.keys(keys).length)
    throw new Error(`No account found on keystore directory "${keystoreDir}"`);
  else if (!address)
    ({ address } = await inquirer.prompt<{ address: string }>([
      { type: 'list', name: 'address', message: 'Account:', choices: Object.keys(keys) },
    ]));
  else if (!(address in keys)) throw new Error(`Could not find keystore file for "${address}"`);

  let password;
  if (passwordFile) password = (await fs.readFile(passwordFile, 'utf-8')).split('\n').shift()!;
  else
    ({ password } = await inquirer.prompt<{ password: string }>([
      { type: 'password', name: 'password', message: `[${address}] Password:`, mask: '*' },
    ]));

  for (const json of keys[address]) {
    try {
      return await Wallet.fromEncryptedJson(json, password);
    } catch (e) {}
  }

  throw new Error(`Could not decrypt keystore for "${address}" with provided password`);
}

function createLocalStorage(name: string): LocalStorage {
  const localStorage = new LocalStorage(name);
  Object.assign(globalThis, { localStorage });
  return localStorage;
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
  // force-exit at most 10s after stopping raiden
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
}

async function createRaidenConfig(
  argv: ReturnType<typeof parseArguments>,
): Promise<Partial<RaidenConfig>> {
  let config: Partial<RaidenConfig> = DEFAULT_RAIDEN_CONFIG;

  if (argv.configFile)
    config = { ...config, ...JSON.parse(await fs.readFile(argv.configFile, 'utf-8')) };

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

  if (argv.routingMode !== 'pfs') config = { ...config, pfs: null };
  else if (argv.pathfindingServiceAddress !== 'auto')
    config = { ...config, pfs: argv.pathfindingServiceAddress };

  if (!argv.enableMonitoring) config = { ...config, monitoringReward: null };

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
          'Have you read, understood and hereby accept the above disclaimer and privacy warning?',
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
  const storage = createLocalStorage(argv.datadir);
  const endpoint = parseEndpoint(argv.apiAddress);
  const config = await createRaidenConfig(argv);

  const raiden = await Raiden.create(
    argv.ethRpcEndpoint,
    wallet.privateKey,
    { storage, prefix: argv.datadir.endsWith('/') ? argv.datadir : argv.datadir + '/' },
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
