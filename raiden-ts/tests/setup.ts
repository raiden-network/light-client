import '@/polyfills';

// import util from 'util';
import logging from 'loglevel';
import PouchDB from 'pouchdb';
import MemAdapter from 'pouchdb-adapter-memory';
import PouchDebug from 'pouchdb-debug';

// util.inspect.defaultOptions.depth = null;
// PouchDB.debug.enable('*');
PouchDB.plugin(MemAdapter);
PouchDB.plugin(PouchDebug);

logging.setLevel(logging.levels.DEBUG);

if (!('RTCPeerConnection' in globalThis)) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Object.assign(globalThis, require('wrtc'));
}
