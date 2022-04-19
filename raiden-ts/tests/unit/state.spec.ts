/* eslint-disable @typescript-eslint/no-explicit-any */
import { promises as fs } from 'fs';
import logging from 'loglevel';
import path from 'path';

import defaultMigrations from '@/db/migrations';
import type { Migrations } from '@/db/types';
import {
  dumpDatabaseToArray,
  getDatabaseConstructorFromOptions,
  getRaidenState,
  latestVersion,
  replaceDatabase,
} from '@/db/utils';
import { RaidenState } from '@/state';
import { TransferState } from '@/transfers/state';
import { jsonParse } from '@/utils/data';
import { decode } from '@/utils/types';

logging.setLevel(
  process.env['NODE_ENV'] === 'production' ? logging.levels.INFO : logging.levels.DEBUG,
);

test('migrate, decode & dump', async () => {
  // iterate over past stored JSON states & ensure they can be migrated to current
  const dir = path.join(__dirname, 'states');
  const states = await fs.readdir(dir);

  // PouchDB configs are passed as custom database constructor using PouchDB.defaults
  const dbCtor = await getDatabaseConstructorFromOptions({
    adapter: 'memory',
    prefix: expect.getState().currentTestName + '/',
  });

  const customObj = { _id: 'state.myCustomProp', value: 1337 };
  const migrations: Migrations = {
    ...defaultMigrations,
    [latestVersion(defaultMigrations) + 1]: async (doc) => {
      if (doc._id !== 'state.address') return [doc];
      return [doc, customObj];
    },
  };

  for (const file of states) {
    if (!file.toLowerCase().endsWith('json')) continue;

    const dbName = `raiden_${file}`;
    logging.info('migrating', file);
    let dump: any = await fs.readFile(path.join(dir, file), { encoding: 'utf-8' });

    if (typeof dump === 'string') dump = jsonParse(dump);
    const db = await replaceDatabase.call(dbCtor, dump, dbName, migrations);

    const decodedState = decode(RaidenState, await getRaidenState(db));
    expect(RaidenState.is(decodedState)).toBe(true);
    expect(decodedState).toMatchObject({ myCustomProp: 1337 });

    const results = await db.find({
      selector: { cleared: { $exists: true }, direction: { $exists: true } },
    });
    for (const doc of results.docs) {
      const decodedTransfer = decode(TransferState, doc);
      expect(TransferState.is(decodedTransfer)).toBe(true);
    }

    await db.close(); // ensure dumpDatabase can reopen it if needed
    const newDump = await dumpDatabaseToArray(db);
    expect(newDump.length).toBeGreaterThanOrEqual(dump.length);
  }
});
