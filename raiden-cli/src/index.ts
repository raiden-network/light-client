import { promises as fs } from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
import yargs from 'yargs';
import { LocalStorage } from 'node-localstorage';
import { Wallet } from 'ethers';
import { Raiden } from 'raiden-ts';
import { CliArguments, Cli } from './types';
import { makeCli } from './cli';
import { setupLoglevel } from './utils/logging';
import DEFAULT_RAIDEN_CONFIG from './config.json';

function parseArguments(): CliArguments {
  return yargs
    .usage('Usage: $0 -k <private_json_path> -e <node_url> --port <port>')
    .options({
      privateKey: {
        type: 'string',
        demandOption: true,
        alias: 'k',
        desc: 'JSON Private Key file path',
        coerce: path.resolve,
      },
      password: {
        type: 'string',
        desc:
          'JSON Private Key password. Better passed through "RAIDEN_PASSWORD" env var. Prompted if not provided',
      },
      ethNode: {
        alias: 'e',
        type: 'string',
        default: 'http://parity.goerli.ethnodes.brainbot.com:8545',
        desc: 'ETH JSON-RPC URL',
      },
      store: {
        alias: 's',
        type: 'string',
        default: './storage',
        desc: 'Dir path where to store state',
      },
      config: {
        alias: 'c',
        coerce: JSON.parse,
        desc: 'JSON to overwrite default/curretn config',
      },
      port: {
        type: 'number',
        default: 5001,
        desc: 'Serve HTTP API on given port',
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

async function getWallet(privateKeyPath: string, password: string): Promise<Wallet> {
  const encryptedKey = await fs.readFile(privateKeyPath, 'utf-8');
  return await Wallet.fromEncryptedJson(encryptedKey, password);
}

function createLocalStorage(name: string): LocalStorage {
  const localStorage = new LocalStorage(name);
  Object.assign(globalThis, { localStorage });
  return localStorage;
}

function shutdown(this: Cli): void {
  if (this.server?.listening) {
    this.log.info('Closing server...');
    this.server.close();
  }

  if (this.raiden.started) {
    this.log.info('Stopping raiden...');
    this.raiden.stop();
  } else {
    process.exit(1);
  }
}

function registerShutdownHooks(this: Cli): void {
  process.on('SIGINT', shutdown.bind(this));
  process.on('SIGTERM', shutdown.bind(this));
}

async function main() {
  const argv = parseArguments();
  const password = argv.password ?? (await askUserForPassword());
  const wallet = await getWallet(argv.privateKey, password);
  const localStorage = createLocalStorage(argv.store);
  const log = setupLoglevel();
  const raiden = await Raiden.create(argv.ethNode, wallet.privateKey, localStorage, undefined, {
    ...DEFAULT_RAIDEN_CONFIG,
    ...argv.config,
  });
  const cli = await makeCli(log, raiden, argv.port);
  registerShutdownHooks.call(cli);
  cli.raiden.start();
}

main().catch((err) => {
  console.error('Main error:', err);
  process.exit(2);
});
