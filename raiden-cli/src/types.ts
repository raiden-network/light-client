import type { Express } from 'express';
import type { Server } from 'http';
import type { Logger } from 'loglevel';

import type { Raiden } from 'raiden-ts';

export interface CliArguments {
  ethNode: string;
  privateKey: string;
  store: string;
  port: number;
  password?: string;
  config?: Record<string, unknown>;
}

export interface Cli {
  log: Logger;
  raiden: Raiden;
}

export interface App {
  app: Express;
  server: Server;
}
