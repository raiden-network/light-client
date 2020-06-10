import { Raiden } from 'raiden-ts';
import { Logger, getLogger } from 'loglevel';
import { makeApp } from './app';
import { Cli } from './types';

export async function makeCli(raiden: Raiden, port: number, log?: Logger): Promise<Cli> {
  log = log ?? getLogger(`cli:${raiden.address}`);
  const cli: Cli = { log, raiden };
  cli.app = makeApp.call(cli);
  cli.server = cli.app.listen(port, () => log!.info(`Server started at port: ${port}`));
  return cli;
}
