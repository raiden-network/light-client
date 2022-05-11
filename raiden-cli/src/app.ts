/* eslint-disable import/no-named-as-default-member */
import cors from 'cors';
import { utils as ethersUtils } from 'ethers';
import type { Express, NextFunction, Request, Response } from 'express';
import express from 'express';
import createError from 'http-errors';
import logger from 'morgan';
import path from 'path';

import { makeApiV1Router } from './routes/api.v1';
import type { Cli } from './types';

const { fetchJson } = ethersUtils;

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

const apiEndpoint = '/api/v1';
const rpcEndpoint = '/rpc';
const uiEndpoint = '/ui';

/**
 * Create an app from the Cli
 *
 * @param this - Cli object
 * @param corsOrigin - Which corsOrigin to accept, if any
 * @param webUi - Whether to enable webUI (needs `yarn build:webui` first)
 * @returns Express app
 */
export function makeApp(this: Cli, corsOrigin?: string, webUi?: boolean): Express {
  const app = express();
  app.use(express.json());

  if (corsOrigin) app.use(cors({ origin: corsOrigin }));
  const loggerMiddleware = logger(
    ':remote-addr - :remote-user ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"',
  );
  app.use(loggerMiddleware);
  app.use(apiEndpoint, makeApiV1Router.call(this));

  if (webUi) {
    this.log.info(`Serving Raiden webUI at ${uiEndpoint}`);

    // proxy endpoint to provider, passthrough version of JsonRpcProvider.send
    app.post(rpcEndpoint, (request, response) =>
      fetchJson(this.raiden.provider.connection, JSON.stringify(request.body)).then(
        (...args) => response.send(...args),
        (err) => response.status(400).send(err),
      ),
    );
    app.get(`${uiEndpoint}/assets/config/config*.json`, (_, response) =>
      response.json({
        raiden: apiEndpoint,
        web3: rpcEndpoint,
        reveal_timeout: this.raiden.config.revealTimeout,
        settle_timeout: this.raiden.config.settleTimeout,
        environment_type: 'development',
      }),
    );
    app.use(uiEndpoint, express.static(path.join(__dirname, 'ui')));
    // SPA fallback
    app.get(`${uiEndpoint}/*`, (_, response) =>
      response.sendFile(path.join(__dirname, 'ui', 'index.html')),
    );
    app.get('/', (_, response) => response.redirect(301, uiEndpoint));
  }

  app.use(notFoundHandler);
  app.use(internalErrorHandler.bind(this));
  return app;
}
