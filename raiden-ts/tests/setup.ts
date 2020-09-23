import 'raiden-ts/polyfills';

// import util from 'util';
// util.inspect.defaultOptions.depth = null;

import PouchDB from 'pouchdb';
import MemAdapter from 'pouchdb-adapter-memory';
PouchDB.plugin(MemAdapter);
import PouchDebug from 'pouchdb-debug';
PouchDB.plugin(PouchDebug);
// PouchDB.debug.enable('*');

import logging from 'loglevel';
logging.setLevel(logging.levels.DEBUG);
