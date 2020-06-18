// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { RaidenChannel } from 'raiden-ts';

declare global {
  namespace Express {
    export interface Request {
      channels: RaidenChannel[];
    }
  }
}
