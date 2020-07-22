import { Raiden } from 'raiden-ts';
import { Logger, getLogger } from 'loglevel';
import { makeApp } from './app';
import { Cli } from './types';

export function makeCli(
  raiden: Raiden,
  endpoint?: number | string,
  log?: Logger,
  corsOrigin?: string,
): Cli {
  log = log ?? getLogger(`cli:${raiden.address}`);
  const cli: Cli = { log, raiden };
  if (endpoint) {
    cli.app = makeApp.call(cli, corsOrigin);
    let host: string, port: number | string;
    if (typeof endpoint === 'number') [host, port] = ['127.0.0.1', endpoint];
    else [host, port] = endpoint.split(':');
    cli.server = cli.app.listen(+port, host, () =>
      log!.info(`Server started at: http://${host}:${port}`),
    );
    cli.server.setTimeout(3.6e6); // 1h
  }
  return cli;
}
