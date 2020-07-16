import { Server } from 'http';
import { Raiden } from 'raiden-ts';
import { Logger } from 'loglevel';
import { Express } from 'express';

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
  app?: Express;
  server?: Server;
}
