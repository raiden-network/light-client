import type { RaidenChannel } from 'raiden-ts';

declare global {
  namespace Express {
    export interface Request {
      channels: RaidenChannel[];
    }
  }
}
