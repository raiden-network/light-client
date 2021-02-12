/* istanbul ignore file */
import PouchDB from 'pouchdb';

let defaultPouchAdapter: string;

/**
 * @returns Default adapter PouchDB option
 */
export async function getDefaultPouchAdapter(): Promise<string> {
  // default RxDB adapters, using dynamic imports (module=ESNext|CommonJS)
  if (defaultPouchAdapter) return defaultPouchAdapter;
  if (globalThis.location?.href) {
    // browser
    const { default: adapterPlugin } = await import('pouchdb-adapter-indexeddb');
    PouchDB.plugin(adapterPlugin);
    defaultPouchAdapter = 'indexeddb';
  } else {
    // node
    const { default: adapterPlugin } = await import('pouchdb-adapter-leveldb');
    PouchDB.plugin(adapterPlugin);
    defaultPouchAdapter = 'leveldb';
  }
  return defaultPouchAdapter;
}
