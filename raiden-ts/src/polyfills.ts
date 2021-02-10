import 'isomorphic-fetch';
import 'abort-controller/polyfill';

// revert matrix-js-sdk monkey-patch root methodFactory
import logging from 'loglevel';
// request.abort() is called when shutting down matrix; this patch clears some timeouts left behind
import { getRequest, request } from 'matrix-js-sdk';
import { logger as matrixLogger } from 'matrix-js-sdk/lib/logger';
// apply
const methodFactory = logging.methodFactory;
Object.assign(logging, { methodFactory }); // revert
matrixLogger.setLevel(logging.levels.DEBUG);
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
