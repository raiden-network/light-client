/* eslint-disable @typescript-eslint/no-explicit-any */

declare module 'matrix-js-sdk/lib/utils' {
  export function encodeUri(pathTemplate: string, variables: { [fragment: string]: any }): string;
}

declare module 'matrix-js-sdk/lib/logger' {
  import log from 'loglevel';
  export const logger: log.Logger;
}

declare module 'abort-controller/polyfill';
