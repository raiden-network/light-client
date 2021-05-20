import '@/polyfills';

import { BigNumber } from '@ethersproject/bignumber';
import PouchDB from 'pouchdb';
import MemAdapter from 'pouchdb-adapter-memory';
import PouchDebug from 'pouchdb-debug';
import util from 'util';

// PouchDB.debug.enable('*');
PouchDB.plugin(MemAdapter);
PouchDB.plugin(PouchDebug);

// better BigNumber inspect representation for logs
Object.defineProperty(BigNumber.prototype, util.inspect.custom, {
  enumerable: false,
  value(this: BigNumber, _: number, opts: util.InspectOptionsStylized) {
    return `${opts.stylize('BN', 'special')}(${opts.stylize(this.toString(), 'number')})`;
  },
});
