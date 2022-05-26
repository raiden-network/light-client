/* eslint-disable @typescript-eslint/no-explicit-any */
import 'isomorphic-fetch';
import 'abort-controller/polyfill';
import './logger';

import { wrapRequest } from 'matrix-js-sdk';
import type { Request, RequestAPI, RequestCallback } from 'request';

let request: RequestAPI<any, any, any>;

/**
 * The original request doesn't error-callback when abort'ing, required to teardown subscriptions
 */
wrapRequest(
  (origRequest: RequestAPI<any, any, any>, opts: unknown, cb: RequestCallback): Request => {
    // matrix-js-sdk uses `import * as request`, which breaks calling default export as function;
    // here we make use of `forever` method to get back the `request` callable api
    request ??= 'forever' in origRequest ? origRequest.forever(undefined, undefined) : origRequest;

    const req: Request = request(opts, cb);
    const origAbort = req.abort;
    req.abort = function abort(this: Request) {
      origAbort.call(this);
      cb(new Error('aborted!'), null as any, null as any);
    };
    return req;
  },
);
