/* eslint-disable @typescript-eslint/no-explicit-any */
import omit from 'lodash/fp/omit';
import logging from 'loglevel';
import PouchDB from 'pouchdb';
import PouchDBFind from 'pouchdb-find';
import type { Observable } from 'rxjs';
import {
  BehaviorSubject,
  defer,
  firstValueFrom,
  from,
  fromEvent,
  lastValueFrom,
  merge,
} from 'rxjs';
import { concatMap, filter, finalize, mergeMap, pluck, takeUntil } from 'rxjs/operators';

import type { Channel } from '../channels';
import { channelKey } from '../channels/utils';
import type { RaidenState } from '../state';
import type { RaidenTransfer } from '../transfers/state';
import { TransferState } from '../transfers/state';
import { raidenTransfer } from '../transfers/utils';
import type { ContractsInfo } from '../types';
import { assert, ErrorCodes } from '../utils/error';
import type { Address } from '../utils/types';
import { decode, last } from '../utils/types';
import { getDefaultPouchAdapter } from './adapter';
import defaultMigrations from './migrations';
import type {
  Migrations,
  RaidenDatabase,
  RaidenDatabaseConstructor,
  RaidenDatabaseMeta,
  RaidenDatabaseOptions,
} from './types';

PouchDB.plugin(PouchDBFind);

const statePrefix = 'state.';
const channelsPrefix = 'channels.';

/**
 * @param prefix - Prefix to query for
 * @param descending - Wether to swap start & endkey for reverse reverse search
 * @returns allDocs's options to fetch all documents which keys start with prefix
 */
function byPrefix(prefix: string, descending = false) {
  const start = prefix;
  const end = prefix + '\ufff0';
  return !descending
    ? { startkey: start, endkey: end }
    : { startkey: end, endkey: start, descending };
}

async function databaseProps(db: RaidenDatabase) {
  await Promise.all([
    /* db.createIndex({
      index: {
        name: 'byCleared',
        fields: ['cleared', 'direction'],
      },
    }), */
    db.createIndex({
      index: {
        name: 'byPartner',
        fields: ['direction', 'partner'],
      },
    }),
    db.createIndex({
      index: {
        name: 'bySecrethash',
        fields: ['secrethash'],
      },
    }),
    db.createIndex({
      index: {
        name: 'byChannel',
        fields: ['channel'],
      },
    }),
    db.createIndex({
      index: {
        name: 'byTransferTs',
        fields: ['transfer.ts'],
      },
    }),
  ]);

  const storageKeys = new Set<string>();
  const results = await db.allDocs({ startkey: 'a', endkey: 'z\ufff0' });
  results.rows.forEach(({ id }) => storageKeys.add(id));
  const busy$ = new BehaviorSubject<boolean>(false);

  return Object.assign(db, { storageKeys, busy$ });
}

/**
 * @param this - RaidenStorage constructor, as static factory param
 * @param name - Name of database to check
 * @returns Promise to database, if it exists, false otherwise
 */
async function databaseExists(
  this: RaidenDatabaseConstructor,
  name: string,
): Promise<RaidenDatabase | undefined> {
  const db = new this(name);
  const info = await db.info();
  if (info.doc_count === 0 && info.update_seq == 0) {
    await db.destroy();
    return;
  }
  return databaseProps(db);
}

/**
 * @param this - RaidenStorage constructor, as static factory param
 * @param name - Database name or path
 * @returns RaidenStorage
 */
async function makeDatabase(
  this: RaidenDatabaseConstructor,
  name: string,
): Promise<RaidenDatabase> {
  const db = new this(name);
  db.setMaxListeners(30);

  return databaseProps(db);
}

/**
 * Create observable of PouchDB.changes stream, with proper teardown
 *
 * @param db - Database to monitor for changes
 * @param options - db.changes options
 * @returns Observable of changes responses
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export function changes$<T = {}>(db: RaidenDatabase, options?: PouchDB.Core.ChangesOptions) {
  // concat allows second defer to be skipped in case of first()/take(1) succeeding
  return defer(() => {
    const feed = db.changes<T>(options);
    return merge(
      fromEvent(feed, 'change') as Observable<[PouchDB.Core.ChangesResponseChange<T>]>,
      fromEvent(feed, 'error').pipe(
        mergeMap((error) => {
          throw error;
        }),
      ),
    ).pipe(
      pluck(0),
      takeUntil(fromEvent(feed, 'complete')),
      finalize(() => feed.cancel()),
    );
  });
}

/**
 * [[dbStateEpic]] stores each key of RaidenState as independent value on the database, prefixed
 * with 'state.', to make it cheaper to save changes touching only a subset of the state.
 * 'channels' (being a special hotpath of complex objects) are split as one entry per channel.
 * This function reads this format, fetching the multiple rows from database and composing an
 * object which should be decodable by [[RaidenState]] codec.
 *
 * @param db - Database to query state from
 * @returns mapping object potentially decodable to RaidenState
 */
export async function getRaidenState(db: RaidenDatabase): Promise<any | undefined> {
  const { log } = db.constructor.__defaults;
  const state = { channels: {}, oldChannels: {}, transfers: {} } as any;

  const stateResults = await db.allDocs<{ _id: string; value: any }>({
    ...byPrefix(statePrefix),
    include_docs: true,
  });
  for (const { id, doc } of stateResults.rows) {
    state[id.substring(statePrefix.length)] = doc!.value;
  }

  const channelsResults = await db.allDocs<Channel>({
    ...byPrefix(channelsPrefix),
    include_docs: true,
  });
  for (const { id, doc } of channelsResults.rows) {
    if ('settleBlock' in doc!)
      state.oldChannels[id] = { ...doc!, _id: id.substring(channelsPrefix.length) };
    else state.channels[channelKey(doc!)] = { ...doc!, _id: id.substring(channelsPrefix.length) };
  }

  const transfersResults = await db.find({
    selector: {
      cleared: 0,
      direction: { $exists: true },
    },
  });
  if (transfersResults.warning) log?.debug(transfersResults.warning, 'getRaidenState');
  for (const doc of transfersResults.docs) {
    state.transfers[doc._id] = doc;
  }

  if ('address' in state) return state;
}

/**
 * Stores each key of RaidenState as independent value on the database, prefixed * with 'state.',
 * to make it cheaper to save changes touching only a subset of the state.
 * 'channels' (being a special hotpath of complex objects) are split as one entry per channel.
 * Used to store initial state (on empty db)
 *
 * @param db - Database to store state into
 * @param state - State to persist
 */
export async function putRaidenState(db: RaidenDatabase, state: RaidenState): Promise<void> {
  const docs = [];
  for (const [key, value] of Object.entries(state)) {
    if (key === 'channels' || key === 'oldChannels') {
      for (const channel of Object.values(value as RaidenState['channels'])) {
        docs.push({ ...channel, _id: channelsPrefix + channel._id });
      }
    } else if (key === 'transfers') {
      for (const transfer of Object.values(value as RaidenState['transfers'])) {
        docs.push(transfer);
      }
    } else {
      docs.push({ _id: statePrefix + key, value });
    }
  }
  await db.bulkDocs(docs);
}

/**
 * @param migrations - Migrations mapping
 * @returns Sorted versions array according with migrations
 */
export function sortMigrations(migrations: Migrations): number[] {
  return Object.keys(migrations)
    .map((k) => +k)
    .sort();
}

/**
 * @param migrations - Migrations mapping
 * @returns Latest/current db version from migrations
 */
export function latestVersion(migrations: Migrations = defaultMigrations): number {
  return last(sortMigrations(migrations)) ?? 0;
}

/**
 * @param db - Raiden database
 * @returns Version of db passed as param
 */
export function databaseVersion(db: RaidenDatabase): number {
  return +db.name.match(/_(\d+)$/)![1]!;
}

/**
 * @param opts - Default database options
 * @returns Constructor function for RaidenStorage
 */
export async function getDatabaseConstructorFromOptions(
  opts: RaidenDatabaseOptions = { log: logging },
): Promise<RaidenDatabaseConstructor> {
  if (!opts.log) opts.log = logging;
  if (!opts.adapter) opts.adapter = await getDefaultPouchAdapter();
  return PouchDB.defaults(opts) as RaidenDatabaseConstructor;
}

/**
 * Detects current version on storage, and migrate it to latest version if needed, resolving to the
 * initialized database instance. May reject if migration fails.
 *
 * @param this - RaidenStorage constructor, as static factory param
 * @param name - Database name (to be suffixed with versions)
 * @param migrations - Map of migrations, indexed by target version number, starting with 1;
 *      Each migration is an async function which receives each entry/row of the previous db and
 *      the old db instance (in case one needs to fetch some data from some other row), and
 *      resolves to an array of new documents (without `_rev`) to be put in the upgraded database.
 *      To remove an entry, simply return empty array, or just return [doc] to migrate as is.
 * @param cleanOld - Whether to clean/remove successfully migrated databases or leave it
 * @returns Promise to instance of currentVersion of database
 */
export async function migrateDatabase(
  this: RaidenDatabaseConstructor,
  name: string,
  migrations: Migrations = defaultMigrations,
  cleanOld = false,
): Promise<RaidenDatabase> {
  const { log } = this.__defaults;
  const sortedMigrations = sortMigrations(migrations);

  let version = 0;
  let db: RaidenDatabase | undefined;
  // try to load some version present on migrations
  for (let i = sortedMigrations.length - 1; i >= 0; --i) {
    const _version = sortedMigrations[i]!;
    const _db = await databaseExists.call(this, `${name}_${_version}`);
    if (_db) {
      version = _version;
      db = _db;
      break;
    }
  }
  // if didn't find, try to load default version=0 (not present on migrations)
  if (!db) db = await databaseExists.call(this, `${name}_${version}`);
  // if still didn't find an existing database, create a new one for latestVersion
  if (!db) {
    version = latestVersion(migrations);
    db = await makeDatabase.call(this, `${name}_${version}`);
  }

  for (const newVersion of sortedMigrations) {
    if (newVersion <= version) continue;
    const newStorage = await makeDatabase.call(this, `${name}_${newVersion}`);

    try {
      const keyRe = /^[a-z]/i;
      await lastValueFrom(
        changes$(db, {
          since: 0,
          include_docs: true,
          filter: ({ _id }) => keyRe.test(_id),
        }).pipe(
          concatMap((change) =>
            defer(() => migrations[newVersion]!(change.doc!, db!)).pipe(
              mergeMap((results) => from(results)),
              concatMap(async (result) => {
                const { _rev: _, ...doc } = result;
                return newStorage.put(doc);
              }),
            ),
          ),
        ),
      );
    } catch (err) {
      log?.error('Error migrating db', { from: version, to: newVersion }, err);
      newStorage.destroy();
      throw err;
    }
    log?.info('Migrated db', { name, from: version, to: newVersion });
    if (cleanOld) await db.destroy();
    else await db.close();
    version = newVersion;
    db = newStorage;
  }
  // shouldn't fail
  assert(databaseVersion(db) === latestVersion(migrations), 'Not latest version');
  return db;
}

/**
 * @param db - Raiden database to fetch meta from
 * @returns Promise which resolves to meta information from database
 */
export async function databaseMeta(db: RaidenDatabase): Promise<RaidenDatabaseMeta> {
  return {
    _id: '_meta',
    version: databaseVersion(db),
    network: (await db.get<{ value: number }>(statePrefix + 'chainId')).value,
    udc: (await db.get<{ value: ContractsInfo }>(statePrefix + 'contracts')).value.UserDeposit
      .address,
    address: (await db.get<{ value: Address }>(statePrefix + 'address')).value,
    blockNumber: (await db.get<{ value: number }>(statePrefix + 'blockNumber')).value,
  };
}

function isAsyncIterable<T>(v: Iterable<T> | AsyncIterable<T>): v is AsyncIterable<T> {
  return typeof (v as AsyncIterable<T>)[Symbol.asyncIterator] === 'function';
}

/**
 * Replace current database with data from a given state dump; the dump must not be older than
 * the state in storage.
 *
 * @param this - RaidenStorage constructor, as static factory param
 * @param data - (possibly async) iterable which yields state entries; must start with '_meta'
 * @param name - Database name (to be suffixed with versions)
 * @param migrations - Map of migrations, indexed by target version number, starting with 1;
 *      Each migration is an async function which receives each entry/row of the previous db and
 *      the old db instance (in case one needs to fetch some data from some other row), and
 *      resolves to an array of new documents (without `_rev`) to be put in the upgraded database.
 *      To remove an entry, simply return empty array, or just return [doc] to migrate as is.
 * @param cleanOld - Weather to clean/remove successfully migrated databases
 * @returns Promise to instance of currentVersion of database
 */
export async function replaceDatabase(
  this: RaidenDatabaseConstructor,
  data: Iterable<any> | AsyncIterable<any>,
  name: string,
  migrations: Migrations = defaultMigrations,
  cleanOld = false,
): ReturnType<typeof migrateDatabase> {
  const { log } = this.__defaults;
  const iter = isAsyncIterable(data) ? data[Symbol.asyncIterator]() : data[Symbol.iterator]();
  const first = await iter.next();
  assert(!first.done && first.value._id === '_meta', 'first yielded value must be "_meta"');
  const meta: RaidenDatabaseMeta = first.value;

  // ensure db's current version in store is older than replacement
  for (let version = latestVersion(migrations); version >= meta.version; --version) {
    const dbName = `${name}_${version}`;
    const db = await databaseExists.call(this, dbName);
    if (!db) continue;
    const dbMeta = await databaseMeta(db);
    assert(
      meta.version >= version && meta.blockNumber >= dbMeta.blockNumber,
      ErrorCodes.RDN_STATE_MIGRATION,
    );
    // shouldn't happen, since [name] is generated from these parameters
    assert(
      meta.address === dbMeta.address,
      [
        ErrorCodes.RDN_STATE_ADDRESS_MISMATCH,
        { expected: dbMeta.address, received: meta.address },
      ],
      log?.error,
    );
    assert(
      meta.udc === dbMeta.udc && meta.network === dbMeta.network,
      [
        ErrorCodes.RDN_STATE_NETWORK_MISMATCH,
        {
          expectedUdc: dbMeta.udc,
          receivedUdc: meta.udc,
          expectedNetwork: dbMeta.network,
          receivedNetwork: meta.network,
        },
      ],
      log?.error,
    );
    // drop versions which would make migration fail
    await db.destroy();
  }

  // iterate and insert entries into db for replacement's version
  const dbName = `${name}_${meta.version}`;
  const db = await makeDatabase.call(this, dbName);
  let next = await iter.next();
  while (!next.done) {
    const doc = next.value;
    if ('_rev' in doc) delete doc['_rev'];
    [next] = await Promise.all([iter.next(), db.put(doc)]);
  }
  log?.warn('Replaced/loaded database', { name, meta });
  await db.close();

  // at this point, `{name}_{meta.version}` database should contain all (and only) data from
  // iterable, and no later version of database should exist, so we can safely migrate
  return await migrateDatabase.call(this, name, migrations, cleanOld);
}

function keyAfter(key: string): string {
  return !key ? '' : key.slice(0, -1) + String.fromCharCode(key.slice(-1).charCodeAt(0) + 1);
}

/**
 * Creates an async generator which yields database entries documents.
 * Can be dumped to a JSON array or streamed. Will throw if database changes while dumping, to
 * invalidate previous dump.  Caller must ensure the database can't change while dumping or handle
 * the exception to restart.
 *
 * @param db - Database to dump
 * @param opts - Options
 * @param opts.batch - Size of batches to fetch and yield
 * @yields Each document in database
 */
export async function* dumpDatabase(db: RaidenDatabase, { batch = 10 }: { batch?: number } = {}) {
  let changed: string | undefined;
  const feed = db.changes({ since: 'now', live: true });
  feed.on('change', ({ id }) => (changed = id));
  await firstValueFrom(db.busy$.pipe(filter((v) => !v)));
  db.busy$.next(true);
  try {
    yield await databaseMeta(db);
    let startkey = 'a';
    while (true) {
      const results = await db.allDocs({
        startkey,
        endkey: '\ufff0',
        limit: batch,
        include_docs: true,
      });

      yield* results.rows.map(({ doc }) => omit(['_rev'], doc!));
      assert(!changed, ['Database changed while dumping', { key: changed! }]);

      const end = last(results.rows);
      if (end) startkey = keyAfter(end.id);
      else break;
    }
  } finally {
    db.busy$.next(false);
    feed.cancel();
  }
}

const pendingFields = [
  'unlockProcessed',
  'expiredProcessed',
  'secretRegistered',
  'channelSettled',
];
/**
 * Efficently get transfers from database when paging with offset and limit
 *
 * @param db - Database instance
 * @param filter - Filter options
 * @param filter.pending - true: only pending; false: only completed; undefined: all
 * @param filter.token - filter by token address
 * @param filter.partner - filter by partner address
 * @param filter.end - filter by initiator or target address
 * @param opts - Changes options
 * @param opts.offset - Offset to skip entries
 * @param opts.limit - Limit number of entries
 * @param opts.desc - Set to true to get new transfers first
 * @returns Promise to array of results
 */
export async function getTransfers(
  db: RaidenDatabase,
  filter?: { pending?: boolean; token?: string; partner?: string; end?: string },
  { offset: skip, desc, ...opts }: { offset?: number; limit?: number; desc?: boolean } = {},
): Promise<RaidenTransfer[]> {
  const $and: any[] = [{ 'transfer.ts': { $gt: 0 } }];
  if (filter) {
    if (filter.pending) {
      for (const field of pendingFields) $and.push({ [field]: { $exists: false } });
    } else if (filter.pending === false) {
      $and.push({ $or: pendingFields.map((field) => ({ [field]: { $exists: true } })) });
    }
    if ('token' in filter) $and.push({ 'transfer.token': filter.token });
    if ('partner' in filter) $and.push({ partner: filter.partner });
    if ('end' in filter)
      $and.push({
        $or: [{ 'transfer.initiator': filter.end }, { 'transfer.target': filter.end }],
      });
  }
  const { docs, warning } = await db.find({
    selector: { $and },
    sort: [{ 'transfer.ts': desc ? 'desc' : 'asc' }],
    skip,
    ...opts,
  });
  if (warning) db.__opts.log?.warn('db.getTransfers', warning);
  return docs.map((doc) => raidenTransfer(decode(TransferState, doc)));
}
