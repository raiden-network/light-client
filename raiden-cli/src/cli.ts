import { Raiden } from 'raiden-ts';
import { Logger } from 'loglevel';
import { makeApp } from './app';
import { Cli } from './types';

export async function makeCli(log: Logger, raiden: Raiden, port: number): Promise<Cli> {
  const cli: Cli = { log, raiden };
  cli.app = makeApp.call(cli);
  cli.server = cli.app.listen(port, () => log.info(`Server started at port: ${port}`));
  return cli;
}
