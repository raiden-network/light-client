import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import createError from 'http-errors';
import logger from 'morgan';
import { Cli } from './types';
import { makeApiV1Router } from './routes/api.v1';

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

export function makeApp(this: Cli, corsOrigin?: string): Express {
  const app = express();
  app.use(express.json());
  if (corsOrigin) app.use(cors({ origin: corsOrigin }));
  app.use(
    logger(
      ':remote-addr - :remote-user ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"',
    ),
  );
  app.use('/api/v1', makeApiV1Router.call(this));
  app.use(notFoundHandler);
  app.use(internalErrorHandler.bind(this));
  return app;
}
