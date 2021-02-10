import cors from 'cors';
import type { Express, NextFunction, Request, Response } from 'express';
import express, { json as expressJson } from 'express';
import createError from 'http-errors';
import logger from 'morgan';

import { makeApiV1Router } from './routes/api.v1';
import type { Cli } from './types';

function notFoundHandler(_request: Request, _response: Response, next: NextFunction) {
  next(createError(404, 'Undefined resource'));
}

function internalErrorHandler(
  this: Cli,
  error: Error,
  _request: Request,
  _response: Response,
  next: NextFunction,
) {
  next(createError(500, error.message));
}

/**
 * Create an app from the Cli
 *
 * @param this - Cli object
 * @param corsOrigin - Which corsOrigin to accept, if any
 * @returns Express app
 */
export function makeApp(this: Cli, corsOrigin?: string): Express {
  const app = express();
  app.use(expressJson());
  if (corsOrigin) app.use(cors({ origin: corsOrigin }));
  const loggerMiddleware = logger(
    ':remote-addr - :remote-user ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"',
  );
  app.use(loggerMiddleware);
  app.use('/api/v1', makeApiV1Router.call(this));
  app.use(notFoundHandler);
  app.use(internalErrorHandler.bind(this));
  return app;
}
