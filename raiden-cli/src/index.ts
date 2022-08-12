/* eslint-disable no-console */
import { ethers, Wallet } from 'ethers';
import { promises as fs } from 'fs';
import { prompt } from 'inquirer';
import { getLogger } from 'loglevel';
import * as path from 'path';

import { Raiden } from 'raiden-ts';

import { makeApp } from './app';
import { createRaidenConfig, parseArguments } from './options';
import type { App, Cli } from './types';
import { setupLoglevel } from './utils/logging';

if (!('RTCPeerConnection' in globalThis)) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Object.assign(globalThis, require('@koush/wrtc'));
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
    ({ address } = await prompt<{ address: string }>([
      { type: 'list', name: 'address', message: 'Account:', choices: Object.keys(keys) },
    ]));
  else if (!(address in keys)) throw new Error(`Could not find keystore file for "${address}"`);

  let password;
  if (passwordFile) password = (await fs.readFile(passwordFile, 'utf-8')).split('\n').shift()!;
  else
    ({ password } = await prompt<{ password: string }>([
      { type: 'password', name: 'password', message: `[${address}] Password:`, mask: '*' },
    ]));

  let lastError;
  for (const json of keys[address]) {
    try {
      return await Wallet.fromEncryptedJson(json, password);
    } catch (err) {
      lastError = err;
      if (err instanceof Error && err.message.includes('invalid counter bytes size')) {
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

async function createDataDirectory(path: string): Promise<void> {
  await fs.mkdir(path, { recursive: true });
}

function unrefTimeout(timeout: number | NodeJS.Timeout) {
  if (typeof timeout === 'number') return;
  timeout.unref();
}

function shutdownServer(this: Cli & App): void {
  if (this.server.listening) {
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

function registerShutdownHooks(this: Cli | (Cli & App)): void {
  // raiden shutdown triggers server shutdown
  if ('server' in this)
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
  process.on('unhandledRejection', (reason) => this.log.warn('Unhandled rejection:', reason));
}

async function main() {
  const argv = await parseArguments();
  const wallet = await getWallet(argv.keystorePath, argv.address, argv.passwordFile);
  setupLoglevel(argv.logFile);
  await createDataDirectory(argv.datadir);
  const config = await createRaidenConfig(argv);

  const raiden = await Raiden.create(
    argv.ethRpcEndpoint,
    wallet.privateKey,
    {
      prefix: argv.datadir.endsWith('/') ? argv.datadir : argv.datadir + '/',
      state: argv.loadState ? JSON.parse(await fs.readFile(argv.loadState, 'utf-8')) : undefined,
    },
    argv.userDepositContractAddress,
    config,
  );

  const log = getLogger(`cli:${raiden.address}`);
  const cli: Cli | (Cli & App) = { log, raiden };
  if (argv.apiAddress) {
    const [host, port] = argv.apiAddress;
    const app = makeApp.call(cli, argv.rpccorsdomain, argv.webUi);
    const server = app.listen(port, host, () =>
      cli.log.info(`Server started at: http://${host}:${port}`),
    );
    server.setTimeout(3.6e6); // 1h
    Object.assign(cli, { app, server });
  }
  registerShutdownHooks.call(cli);
  await raiden.start();
}

main().catch((err) => {
  console.error('Main error:', err);
  process.exit(2);
});
