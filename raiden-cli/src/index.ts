import { promises as fs } from 'fs';
import * as path from 'path';
import { Server } from 'http';
import inquirer from 'inquirer';
import yargs from 'yargs';
import { LocalStorage } from 'node-localstorage';
import { Wallet } from 'ethers';
import logging from 'loglevel';
import app from './app';
import RaidenService from './raiden';
import { CliArguments } from './types';

let log: logging.Logger = logging;
let server: Server;

function parseArguments(): CliArguments {
  return yargs
    .usage('Usage: $0 -k <private_json_path> -e <node_url> --serve <port>')
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
        default: 8080,
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

function initLogging(address: string): void {
  log = logging.getLogger(`cli:${address}`);
  log.info('Address:', address);
}

function shutdown(): void {
  log.info('Stopping...');
  try {
    RaidenService.getInstance().stop();
    if (server?.listening) server.close();
    // TODO: unsubscribe
    //
    // if events$ completes, it means raiden shut down
    // let stopSub: ReturnType<typeof raiden.events$.subscribe>;
    // stopSub = raiden.events$.subscribe(undefined, raidenStop, raidenStop);
    // const raidenStop = () => {
    //   if (stopSub) stopSub.unsubscribe();
    // };
  } catch (err) {
    log.error(err);
    process.exit(1);
  }
}

function registerShutdownHooks(): void {
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function startServer(port: number): void {
  server = app.listen(port, () => {
    log.info(`Serving Raiden LC API at http://localhost:${port}...`);
  });
}

async function main() {
  logging.setLevel(logging.levels.DEBUG);
  const argv = parseArguments();
  const password = argv.password ?? (await askUserForPassword());
  const wallet = await getWallet(argv.privateKey, password);
  const localStorage = createLocalStorage(argv.store);

  initLogging(wallet.address);
  registerShutdownHooks();
  await RaidenService.connect(argv.ethNode, wallet.privateKey, localStorage, {
    ...argv.config,
  });
  startServer(argv.port);
}

main().catch((err) => {
  console.error('Main error:', err);
  process.exit(2);
});
