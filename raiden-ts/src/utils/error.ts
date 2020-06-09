/* eslint-disable @typescript-eslint/no-explicit-any */
import * as t from 'io-ts';
import { map } from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/pipeable';
import findKey from 'lodash/findKey';

import errorCodes from '../errors.json';

export const ErrorCodes = errorCodes;
export type ErrorCodes = keyof typeof ErrorCodes;

export const ErrorDetails = t.record(t.string, t.union([t.string, t.number, t.boolean, t.null]));
export interface ErrorDetails extends t.TypeOf<typeof ErrorDetails> {}

export class RaidenError extends Error {
  public name = 'RaidenError';

  public constructor(message?: string, public details: ErrorDetails = {}) {
    super(message);
    Object.setPrototypeOf(this, RaidenError.prototype);
  }

  public get code(): ErrorCodes {
    return (findKey(ErrorCodes, (message) => message === this.message) ??
      'RDN_GENERAL_ERROR') as ErrorCodes;
  }
}

/**
 * Type-safe assertion function (TS3.7)
 *
 * @param condition - Condition to validate as truthy
 * @param error - Message, Error, error factory or tuple of RaidenError constructor parameters
 *      to throw if condition is falsy
 * @param log - Logger to log error to
 */
export function assert<E extends Error = RaidenError>(
  condition: any,
  error?:
    | string
    | E
    | ((condition?: any) => E | never)
    | ConstructorParameters<typeof RaidenError>,
  log?: (...args: any[]) => void,
): asserts condition {
  if (!condition) {
    log?.('__assertion failed:', condition, error);
    throw error instanceof Error
      ? error
      : typeof error === 'function'
      ? error(condition)
      : Array.isArray(error)
      ? new RaidenError(...error)
      : new RaidenError(error ?? ErrorCodes.RDN_ASSERT_ERROR, { condition });
  }
}

const serializedErr = t.intersection([
  t.type({ name: t.string }),
  t.partial({ message: t.string, stack: t.string, details: ErrorDetails }),
]);

/**
 * Simple Error codec
 *
 * This codec doesn't decode to an instance of the exact same error class object, but instead to
 * a generic Error, but assigning 'name', 'stack' & 'message' properties, more as an informative
 * object.
 */
export const ErrorCodec = new t.Type<
  Error,
  { name: string; message?: string; stack?: string; details?: ErrorDetails }
>(
  'Error',
  // if it quacks like a duck... without relying on instanceof
  (u: unknown): u is Error => typeof u === 'object' && !!u && 'name' in u && 'message' in u,
  (u) =>
    pipe(
      serializedErr.decode(u),
      map((error) => {
        if ('details' in error) {
          return Object.assign(new RaidenError(error.message, error.details), {
            name: error.name,
            stack: error.stack,
          });
        } else {
          return Object.assign(new Error(error.message), { name: error.name, stack: error.stack });
        }
      }),
    ),
  (error: RaidenError | Error) => ({
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...('details' in error ? { details: error.details } : {}),
  }),
);
