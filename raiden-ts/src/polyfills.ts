import 'symbol-observable';
import 'isomorphic-fetch';
import 'abort-controller/polyfill';

// matrix-js-sdk monkey-patch root methodFactory
import logging from 'loglevel';
const methodFactory = logging.methodFactory;
import { logger as matrixLogger } from 'matrix-js-sdk/lib/logger';
Object.assign(logging, { methodFactory }); // revert
matrixLogger.setLevel(logging.levels.DEBUG); // apply

// request.abort() is called when shutting down matrix; this patch clears some timeouts left behind
import { getRequest, request } from 'matrix-js-sdk';
const origRequest = getRequest();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReqCb = (err?: Error, res?: any, body?: any) => void;
// 'request' replaces matrix's request
request((opts: object, cb: ReqCb) => {
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

// patch createNewMatrixCall to prevent matrix-js-sdk from hooking WebRTC events in browser;
// ugly, but there's no option to prevent MatrixClient to handle m.call.* events
import * as call from 'matrix-js-sdk/lib/webrtc/call';
Object.assign(call, { createNewMatrixCall: () => null });
