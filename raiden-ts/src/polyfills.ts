import 'symbol-observable';
import 'isomorphic-fetch';
import 'abort-controller/polyfill';

// matrix-js-sdk monkey-patch root methodFactory
import logging from 'loglevel';
const methodFactory = logging.methodFactory;
import { logger as matrixLogger } from 'matrix-js-sdk/lib/logger';
Object.assign(logging, { methodFactory }); // revert
matrixLogger.setLevel(logging.levels.DEBUG); // apply
