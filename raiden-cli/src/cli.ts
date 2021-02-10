import type { Logger } from 'loglevel';
import { getLogger } from 'loglevel';

import type { Raiden } from 'raiden-ts';

import { makeApp } from './app';
import type { Cli } from './types';

/**
 * Populate a Cli with app and server properties
 *
 * @param raiden - Raiden SDK instance
 * @param endpoint - tuple of [host, port] for endpoint to listen on (if any)
 * @param log - Logger instance
 * @param corsOrigin - Accept cors requests from this origin
 * @returns Cli instance
 */
export function makeCli(
  raiden: Raiden,
  endpoint?: readonly [string, number],
  log?: Logger,
  corsOrigin?: string,
): Cli {
  log = log ?? getLogger(`cli:${raiden.address}`);
  const cli: Cli = { log, raiden };
  if (endpoint) {
    const [, port] = endpoint;
    let [host] = endpoint;
    host = host || '127.0.0.1';
    cli.app = makeApp.call(cli, corsOrigin);
    cli.server = cli.app.listen(port, host, () =>
      log!.info(`Server started at: http://${host}:${port}`),
    );
    cli.server.setTimeout(3.6e6); // 1h
  }
  return cli;
}
