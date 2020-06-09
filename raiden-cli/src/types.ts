import { Raiden } from 'raiden-ts';
import { Logger } from 'loglevel';
import { Express } from 'express';
import { Server } from 'http';

/* eslint-disable @typescript-eslint/camelcase */
export interface CliArguments {
  ethNode: string;
  privateKey: string;
  store: string;
  port: number;
  password?: string;
  config?: object;
}

export interface Cli {
  log: Logger;
  raiden: Raiden;
  app?: Express;
  server?: Server;
}

// Data structures as exchanged over the API
export interface ApiChannel {
  channel_identifier: number;
  token_network_address: string;
  partner_address: string;
  token_address: string;
  balance: string;
  total_deposit: string;
  state: string;
  settle_timeout: number;
  reveal_timeout: number;
}
