import express, { Express, Request, Response, NextFunction, Errback } from 'express';
import createError from 'http-errors';
import { Cli } from './types';
import { makeApiV1Router } from './routes/api.v1';

function notFoundHandler(_request: Request, _response: Response, next: NextFunction) {
  next(createError(404, 'Undefined resource'));
}

function internalErrorHandler(
  this: Cli,
  error: Errback,
  _request: Request,
  _response: Response,
  next: NextFunction,
) {
  this.logging.error(error);
  next(createError(500, 'Internal Raiden node error'));
}

export function makeApp(this: Cli): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', makeApiV1Router.call(this));
  app.use(notFoundHandler);
  app.use(internalErrorHandler.bind(this));
  return app;
}
