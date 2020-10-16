import 'symbol-observable';
import 'isomorphic-fetch';
import 'abort-controller/polyfill';

// revert matrix-js-sdk monkey-patch root methodFactory
import logging from 'loglevel';
const methodFactory = logging.methodFactory;
import { logger as matrixLogger } from 'matrix-js-sdk/lib/logger';
Object.assign(logging, { methodFactory }); // revert
matrixLogger.setLevel(logging.levels.DEBUG); // apply

declare module 'matrix-js-sdk' {
  // augment MatrixEvent interface/class
  export interface MatrixEvent {
    getContent(): any; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}

// request.abort() is called when shutting down matrix; this patch clears some timeouts left behind
import { getRequest, request } from 'matrix-js-sdk';
const origRequest = getRequest();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReqCb = (err?: Error, res?: any, body?: any) => void;
// 'request' replaces matrix's request
request((opts: Record<string, unknown>, cb: ReqCb) => {
  const req = origRequest(opts, cb);
  const origAbort = req.abort.bind(req);
  return Object.assign(req, {
    abort: function () {
      origAbort();
      cb(new Error('aborted!')); // also call callback when aborting, to clear pending timeouts
    },
  });
});

if (!('RTCPeerConnection' in globalThis)) {
  Object.assign(globalThis, require('wrtc')); // eslint-disable-line @typescript-eslint/no-var-requires
}
