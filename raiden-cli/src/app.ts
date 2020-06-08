import { Server } from 'http';
import express, { Request, Response, NextFunction, Errback } from 'express';
import createError from 'http-errors';
import { log } from './utils/logging';
import apiV1 from './routes/api.v1';

let server: Server;

function notFoundHandler(_request: Request, _response: Response, next: NextFunction) {
  next(createError(404, 'Undefined resource'));
}

function internalErrorHandler(
  error: Errback,
  _request: Request,
  _response: Response,
  next: NextFunction,
) {
  log.error(error);
  next(createError(500, 'Internal Raiden node error'));
}

const app = express();

app.use(express.json());
app.use('/api/v1', apiV1);
app.use(notFoundHandler);
app.use(internalErrorHandler);

export function startServer(port: number): void {
  if (server === undefined) {
    server = app.listen(port, () => {
      log.info(`Serving Raiden LC API at http://localhost:${port}...`);
    });
  }
}

export function stopServer(): void {
  if (server?.listening) {
    server.close();
  }
}
