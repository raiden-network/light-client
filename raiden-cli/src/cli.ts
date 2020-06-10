import { Raiden } from 'raiden-ts';
import { Logger } from 'loglevel';
import { makeApp } from './app';
import { Cli } from './types';

export async function makeCli(logging: Logger, raiden: Raiden, port: number): Promise<Cli> {
  const cli: Cli = { logging, raiden };
  cli.app = makeApp.call(cli);
  cli.server = cli.app.listen(port, () => logging.info(`Server started at port: ${port}`));
  return cli;
}
