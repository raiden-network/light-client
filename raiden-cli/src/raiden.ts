import { promises as fs } from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
import yargs from 'yargs';
import { LocalStorage } from 'node-localstorage';
import { Wallet } from 'ethers';
import { Raiden, Address, RaidenConfig, assert } from 'raiden-ts';
import { Cli } from './types';
import { makeCli } from './cli';
import { setupLoglevel } from './utils/logging';
import DEFAULT_RAIDEN_CONFIG from './config.json';

function parseArguments() {
  return yargs
    .usage('Usage: $0')
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
        demandOption: true,
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
      enableMonitoring: {
        type: 'boolean',
        default: true,
        desc: "By default, enables monitoring if there's a UDC deposit",
      },
    })
    .env('RAIDEN')
    .help().argv;
}

async function askUserForPassword(): Promise<string> {
  const userInput = await inquirer.prompt<{ password: string }>([
    { type: 'password', name: 'password', message: 'Private Key Password:', mask: '*' },
  ]);
  return userInput.password;
}

async function getWallet(
  keystoreDir: string,
  address: string,
  passwordFile?: string,
): Promise<Wallet> {
  let password;
  if (!passwordFile) password = await askUserForPassword();
  else password = (await fs.readFile(passwordFile, 'utf-8')).split('\n').shift()!;
  for (const filename of await fs.readdir(keystoreDir)) {
    try {
      const json = await fs.readFile(path.join(keystoreDir, filename), 'utf-8');
      const wallet = await Wallet.fromEncryptedJson(json, password);
      assert(wallet.address === address);
      return wallet;
    } catch (e) {}
  }
  throw new Error(`Could not find keystore file for "${address}"`);
}

function createLocalStorage(name: string): LocalStorage {
  const localStorage = new LocalStorage(name);
  Object.assign(globalThis, { localStorage });
  return localStorage;
}

function shutdownServer(this: Cli): void {
  if (this.server?.listening) {
    this.log.info('Closing server...');
    this.server.close();
  }
}

function unrefTimeout(timeout: number | NodeJS.Timeout) {
  if (typeof timeout === 'number') return;
  timeout.unref();
}

function shutdownRaiden(this: Cli): void {
  if (this.raiden.started) {
    this.log.info('Stopping raiden...');
    this.raiden.stop();
    // force-exit at most 5s after stopping raiden
    unrefTimeout(setTimeout(() => process.exit(0), 5000));
  } else {
    process.exit(1);
  }
}

function registerShutdownHooks(this: Cli): void {
  // raiden shutdown triggers server shutdown
  this.raiden.state$.subscribe(undefined, shutdownServer.bind(this), shutdownServer.bind(this));
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

async function main() {
  setupLoglevel();
  const argv = parseArguments();
  const localStorage = createLocalStorage(argv.datadir);
  const endpoint = parseEndpoint(argv.apiAddress);
  const wallet = await getWallet(argv.keystorePath, argv.address, argv.passwordFile);
  const config = await createRaidenConfig(argv);

  const raiden = await Raiden.create(
    argv.ethRpcEndpoint,
    wallet.privateKey,
    localStorage,
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
