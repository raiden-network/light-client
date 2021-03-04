import 'isomorphic-fetch';
import 'abort-controller/polyfill';
import './logger';

// 'request' replaces matrix's request
import { getRequest, request } from 'matrix-js-sdk';

const origRequest = getRequest();
// request.abort() is called when shutting down matrix; this patch clears some timeouts left behind
// eslint-disable-next-line @typescript-eslint/no-explicit-any
request((opts: Record<string, unknown>, cb: (err?: Error, res?: any, body?: any) => void) => {
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
