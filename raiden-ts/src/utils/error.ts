import * as t from 'io-ts';
import { map } from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/pipeable';

import { PfsErrorCodes } from '../path/errors';

export const ErrorDetails = t.array(
  t.type({
    key: t.string,
    value: t.union([t.string, t.number]),
  }),
);
export interface ErrorDetails extends t.TypeOf<typeof ErrorDetails> {}

export default class RaidenError extends Error {
  code: string;
  details?: ErrorDetails;

  constructor(message: string, details?: ErrorDetails) {
    super(message || 'General Error');
    this.name = 'RaidenError';
    this.code = this.getCode(message);
    this.details = details;
  }

  getCode(message: string): string {
    return message ?? 'RAIDEN_ERROR';
  }
}

export class PfsError extends RaidenError {
  constructor(message: PfsErrorCodes, details?: ErrorDetails) {
    super(message, details);
    this.name = 'PfsError';
  }

  getCode(message: string): string {
    return (
      Object.keys(PfsErrorCodes).find(code => Object(PfsErrorCodes)[code] === message) ??
      'PFS_GENERAL_ERROR'
    );
  }
}

const serializedErr = t.intersection([
  t.type({ name: t.string, message: t.string, code: t.string }),
  t.partial({ stack: t.string, details: ErrorDetails }),
]);

/**
 * Simple Error codec
 *
 * This codec doesn't decode to an instance of the exact same error class object, but instead to
 * a generic Error, but assigning 'name', 'stack' & 'message' properties, more as an informative
 * object.
 */
export const ErrorCodec = new t.Type<
  RaidenError,
  { name: string; message: string; code: string; stack?: string; details?: ErrorDetails }
>(
  'RaidenError',
  (u: unknown): u is RaidenError => u instanceof RaidenError,
  u => {
    if (u instanceof RaidenError) return t.success(u);
    return pipe(
      serializedErr.decode(u),
      map(({ name, message, code, stack, details }) => {
        switch (name) {
          case 'PfsError':
            return Object.assign(new PfsError(message as PfsErrorCodes, details), {
              name,
              stack,
              code,
            });
        }

        return Object.assign(new RaidenError(message), { name, stack });
      }),
    );
  },
  ({ name, message, stack, details, code }) => ({
    name,
    message,
    stack,
    code,
    details: details ?? undefined,
  }),
);
