import { Raiden } from 'raiden-ts';
import { Logger, getLogger } from 'loglevel';
import { makeApp } from './app';
import { Cli } from './types';

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
