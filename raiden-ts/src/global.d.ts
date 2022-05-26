declare module 'abort-controller/polyfill';

declare module 'pouchdb-adapter-indexeddb';
declare module 'pouchdb-debug';

declare type Mutable<T> = { -readonly [P in keyof T]: T[P] };
