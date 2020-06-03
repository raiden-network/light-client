// imports
import { promises as fs } from 'fs';
import * as path from 'path';
import { Server } from 'http';

import inquirer from 'inquirer';
import yargs from 'yargs';
import { first } from 'rxjs/operators';
import { LocalStorage } from 'node-localstorage';
import { Wallet } from 'ethers';
import { BigNumberish, parseEther } from 'ethers/utils';
import express, { Express } from 'express';
import logging from 'loglevel';

import { Raiden, RaidenChannel, RaidenTransfer } from 'raiden-ts';

// global declarations
let raiden: Raiden;
let log: logging.Logger = logging;
let app: Express;
let server: Server;

async function raidenGetChannel(token: string, partner: string) {
  const channels = await raiden.channels$.pipe(first()).toPromise();
  return channels?.[token]?.[partner];
}

async function raidenEnsureChannelIsFunded(
  channel: RaidenChannel,
  deposit: BigNumberish,
  mint?: boolean,
) {
  const start = Date.now();
  if (channel.ownDeposit.lt(deposit)) {
    const amount = channel.ownDeposit.sub(deposit).mul(-1);
    if (mint && (await raiden.getTokenBalance(channel.token)).lt(amount)) {
      log.info('Minting:', amount.toString());
      await raiden.mint(channel.token, amount);
    }
    const tx = await raiden.depositChannel(channel.token, channel.partner, amount);
    log.warn('Channel deposited', tx, ', took', Date.now() - start);
  } else {
    log.info('Channel already funded:', channel.ownDeposit.toString());
  }
  return (await raidenGetChannel(channel.token, channel.partner)).ownDeposit.toString();
}

async function raidenEnsureChannelIsOpen(
  token: string,
  partner: string,
  deposit?: BigNumberish,
  mint?: boolean,
) {
  const start = Date.now();
  let channel = await raidenGetChannel(token, partner);
  if (!channel) {
    if (deposit && mint && (await raiden.getTokenBalance(token)).lt(deposit)) {
      log.info('Minting:', deposit.toString());
      await raiden.mint(token, deposit);
    }
    // depositing on openChannel is faster
    await raiden.openChannel(token, partner, { deposit });
    channel = await raidenGetChannel(token, partner);
    log.warn('Channel opened:', channel, ', took', Date.now() - start);
  } else {
    log.info('Channel already present:', channel);
    // if channel already present, ensure it's funded
    if (deposit) {
      await raidenEnsureChannelIsFunded(channel, deposit, mint);
    }
  }
  return channel;
}

async function raidenTransfer(
  token: string,
  target: string,
  amount: BigNumberish,
  opts: { identifier?: BigNumberish } = {},
) {
  let revealAt: number;
  let unlockAt: number;
  await raiden.getAvailability(target);
  const { identifier: paymentId, ...rest } = opts;
  const key = await raiden.transfer(token, target, amount, {
    paymentId,
    ...rest,
  });

  const transfer = await new Promise<RaidenTransfer>((resolve, reject) => {
    const sub = raiden.transfers$.subscribe((t) => {
      if (t.key !== key) return;
      log.debug('Transfer:', t);
      if (!revealAt && t.success !== undefined) revealAt = t.changedAt.getTime();
      if (!unlockAt && t.status.startsWith('UNLOCK')) unlockAt = t.changedAt.getTime();
      if (!t.completed) return;
      else if (t.success) resolve(t);
      else reject(t);
      sub.unsubscribe();
    });
  });
  log.warn(
    'Transfer: took total =',
    transfer.changedAt.getTime() - transfer.startedAt.getTime(),
    ', reveal =',
    revealAt! - transfer.startedAt.getTime(),
    ', unlock =',
    unlockAt! - transfer.startedAt.getTime(),
  );
  return transfer;
}

async function raidenInit({
  token,
  partner,
  deposit,
  mint,
  transfer: value,
  target,
}: {
  token?: string;
  partner?: string;
  deposit?: BigNumberish;
  mint?: boolean;
  transfer?: string;
  target?: string;
} = {}) {
  const start = Date.now();
  // wait started
  await raiden.action$.pipe(first((a) => a.type === 'matrix/setup')).toPromise();
  await raiden.events$.pipe(first((a) => a.type === 'new/block')).toPromise();
  log.warn(
    'Started: #',
    await raiden.getBlockNumber(),
    new Date(),
    ', balance =',
    (await raiden.getBalance()).toString(),
    ', took',
    Date.now() - start,
  );

  if (token) {
    log.info('Token:', token, 'balance =', (await raiden.getTokenBalance(token)).toString());

    if (partner) await raidenEnsureChannelIsOpen(token, partner, deposit, mint);

    if (value && target) {
      const availability = await raiden.getAvailability(target);
      if (!availability.available) {
        log.error('Target', target, 'not available:', availability);
      } else {
        await raidenTransfer(token, target, value);
      }
    }
  }
  const udcToken = await raiden.userDepositTokenAddress();
  const amount = parseEther('10');
  if ((await raiden.getTokenBalance(udcToken)).isZero()) {
    await raiden.mint(udcToken, amount);
    await raiden.depositToUDC(amount);
  }
  log.warn('Init: took', Date.now() - start);
}

async function setupApi(port: number) {
  const api = '/api/v1';
  app = express();
  app.use(express.json());

  app.get(`${api}/channels`, ({}, res) => {
    raiden.channels$.pipe(first()).subscribe((c) => res.json(c));
  });

  app.get(`${api}/address`, ({}, res) => {
    res.json({ our_address: raiden.address });
  });

  app.post(`${api}/payments/:token/:target`, (req, res) => {
    raidenTransfer(req.params.token, req.params.target, req.body['amount'], req.body).then(
      (tr) => res.json(tr),
      (err) => res.status(400).json(err),
    );
  });

  app.post(`${api}/config`, (req, res) => {
    raiden.updateConfig(req.body);
    res.json(raiden.config);
  });

  return new Promise<{ app: Express; server: Server }>(
    (resolve) =>
      (server = app.listen(port, () => {
        log.info(`Serving Raiden LC API at http://localhost:${port}...`);
        resolve({ app, server });
      })),
  );
}

async function main() {
  logging.setLevel(logging.levels.DEBUG);
  const argv = yargs
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
      token: {
        type: 'string',
        desc: 'Token address to operate on',
      },
      partner: {
        type: 'string',
        desc: 'Open a channel with given partner',
        implies: 'token',
      },
      deposit: {
        type: 'string',
        desc: 'Deposit this value to channel with partner',
        implies: 'partner',
      },
      mint: {
        alias: 'm',
        type: 'boolean',
        desc: 'Mint amount to deposit',
        implies: 'deposit',
      },
      transfer: {
        type: 'string',
        desc: 'Transfer this amount to target',
        implies: 'token',
      },
      target: {
        type: 'string',
        desc: 'Transfer to this address',
        implies: 'transfer',
      },
      serve: {
        type: 'number',
        desc: 'Serve HTTP API on given port',
      },
    })
    .env('RAIDEN')
    .help().argv;

  // eslint-disable-next-line prefer-const
  let stopSub: ReturnType<typeof raiden.events$.subscribe>;
  const raidenStop = () => {
    if (stopSub) stopSub.unsubscribe();
    if (server?.listening) server.close();
    if (!raiden?.started) process.exit(1);
    log.info('Stopping...');
    raiden.stop();
  };
  process.on('SIGINT', raidenStop);
  process.on('SIGTERM', raidenStop);

  if (!argv.password) {
    // argv.password = inquirer.prompt('Private Key Password: ', { hideEchoBack: true });
    argv.password = (
      await inquirer.prompt<{ password: string }>([
        { type: 'password', name: 'password', message: 'Private Key Password:', mask: '*' },
      ])
    ).password;
  }

  const wallet = await Wallet.fromEncryptedJson(
    await fs.readFile(argv.privateKey, 'utf-8'),
    argv.password,
  );
  log = logging.getLogger(`cli:${wallet.address}`);
  log.info('Address:', wallet.address);

  const localStorage = new LocalStorage(argv.store);
  Object.assign(globalThis, { localStorage });

  const defaultConfig = {
    matrixServer: 'https://raidentransport.test001.env.raiden.network',
    pfs: 'https://pfs.raidentransport.test001.env.raiden.network',
    pfsSafetyMargin: 1.1,
    caps: { noDelivery: true, webRTC: true },
  };
  raiden = await Raiden.create(argv.ethNode, wallet.privateKey, localStorage, undefined, {
    ...defaultConfig,
    ...argv.config,
  });

  const init = raidenInit(argv);
  raiden.start();
  // if events$ completes, it means raiden shut down
  stopSub = raiden.events$.subscribe(undefined, raidenStop, raidenStop);
  try {
    await init;
    if (argv.serve) await setupApi(argv.serve);
  } finally {
    if (!argv.serve) raidenStop();
  }
}

main().catch((err) => {
  console.error('Main error:', err);
  process.exit(2);
});
