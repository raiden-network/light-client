import type {
  MonoTypeOperatorFunction,
  Observable,
  ObservableInput,
  OperatorFunction,
} from 'rxjs';
import { defer, EMPTY, from, pairs, race, throwError, timer } from 'rxjs';
import {
  concatMap,
  delay,
  distinctUntilChanged,
  endWith,
  filter,
  ignoreElements,
  last,
  map,
  mergeMap,
  mergeMapTo,
  pluck,
  repeatWhen,
  retryWhen,
  scan,
  switchMap,
  takeUntil,
  takeWhile,
  tap,
} from 'rxjs/operators';

import type { ErrorMatches } from './error';
import { matchError } from './error';
import { isntNil } from './types';

/**
 * Maps each source value (an object) to its specified nested property,
 * and emits only if the value changed since last emission
 *
 * It's a combination of `pluck` and `distinctUntilChanged` operators.
 *
 * @param properties - The nested properties to pluck from each source value (an object).
 * @returns A new Observable of property values from the source values.
 */
export const pluckDistinct: typeof pluck = <T, R>(...properties: string[]) => (
  source: Observable<T>,
) => source.pipe(pluck<T, R>(...properties), distinctUntilChanged());

/**
 * Creates an operator to output changed values unique by key ([key, value] tuples)
 * It's equivalent to (from(Object.entries) + distinct), but uses key to prevent memory leak
 *
 * @param compareFn - Function to compare equality between two values, default to === (reference)
 * @returns Operator to map from a record to changed values (all on first)
 */
export function distinctRecordValues<R>(
  compareFn: (x: R, y: R) => boolean = (x, y) => x === y,
): OperatorFunction<{ [k: string]: R }, [string, R]> {
  return (input: Observable<Record<string, R>>): Observable<[string, R]> =>
    input.pipe(
      distinctUntilChanged(),
      mergeMap((map) => pairs<R>(map)),
      /* this scan stores a reference to each [key,value] in 'acc', and emit as 'changed' iff it
       * changes from last time seen. It relies on value references changing only if needed */
      scan<[string, R], { acc: { [k: string]: R }; changed?: [string, R] }>(
        ({ acc }, [key, value]) =>
          // if ref didn't change, emit previous accumulator, without 'changed' value
          compareFn(acc[key], value)
            ? { acc }
            : // else, update ref in 'acc' and emit value in 'changed' prop
              { acc: { ...acc, [key]: value }, changed: [key, value] },
        { acc: {} as { [k: string]: R } },
      ),
      pluck('changed'),
      filter(isntNil), // filter out if reference didn't change from last emit
    );
}

/**
 * Operator to repeat-subscribe an input observable until a notifier emits
 *
 * @param notifier - Notifier observable to stop repeating
 * @param delayMs - Delay between retries or an Iterator of delays; in milliseconds
 * @returns Monotype operator function
 */
export function repeatUntil<T>(
  notifier: Observable<unknown>,
  delayMs: number | Iterator<number> = 30e3,
): MonoTypeOperatorFunction<T> {
  // Resubscribe/retry every 30s or yielded ms after messageSend succeeds
  // Notice first (or any) messageSend.request can wait for a long time before succeeding, as it
  // waits for address's user in transport to be online and joined room before actually
  // sending the message. That's why repeatWhen emits/resubscribe only some time after
  // sendOnceAndWaitSent$ completes, instead of a plain 'interval'
  return (input$) =>
    input$.pipe(
      repeatWhen((completed$) =>
        completed$.pipe(
          map(() => {
            if (typeof delayMs === 'number') return delayMs;
            const next = delayMs.next();
            return !next.done ? next.value : -1;
          }),
          takeWhile((value) => value >= 0), // stop repeatWhen when done
          switchMap((value) => timer(value)),
        ),
      ),
      takeUntil(notifier),
    );
}

// guard an Iterable between an iterable and iterator union
function isIterable<T>(interval: Iterable<T> | Iterator<T>): interval is Iterable<T> {
  return Symbol.iterator in interval;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PredicateFunc = (err: any, count: number) => boolean | undefined;
/**
 * Operator to retry/re-subscribe input$ until a stopPredicate returns truthy or delayMs iterator
 * completes, waiting delayMs milliseconds between retries.
 * Input observable must be re-subscribable/retriable.
 *
 * @param interval - Interval, iterable or iterator of intervals to wait between retries;
 *    if it's an iterable, it resets (iterator recreated) if input$ emits
 * @param options - Retry options, conditions are ANDed
 * @param options.maxRetries - Throw (give up) after this many retries (defaults to 10,
 *    pass 0 to retry indefinitely or as long as iterator yields positive intervals)
 * @param options.onErrors - Retry if error.message or error.httpStatus matches any of these
 * @param options.neverOnErrors - Throw if error.message or error.httpStatus matches any of these
 * @param options.predicate - Retry if this function, receiving error+count returns truthy
 * @param options.stopPredicate - Throw if this function, receiving error+count returns truthy
 * @param options.log - Log with this function on every retry or when throwing, e.g. log.info
 * @returns Operator function to retry if stopPredicate not truthy waiting between retries
 */
export function retryWhile<T>(
  interval: number | Iterator<number> | Iterable<number>,
  options: {
    maxRetries?: number;
    onErrors?: ErrorMatches;
    neverOnErrors?: ErrorMatches;
    predicate?: PredicateFunc;
    stopPredicate?: PredicateFunc;
    log?: (...args: any[]) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
  } = {},
): MonoTypeOperatorFunction<T> {
  let iter: Iterator<number> | undefined;
  return (input$) =>
    input$.pipe(
      // if input$ emits, reset iter (only useful if delayMs is an Iterable)
      tap(() => (iter = undefined)),
      retryWhen((error$) =>
        error$.pipe(
          mergeMap((error, count) => {
            let delayMs;
            if (typeof interval === 'number') delayMs = interval;
            else {
              if (!iter) {
                if (isIterable(interval)) iter = interval[Symbol.iterator]();
                else iter = interval;
              }
              const next = iter.next();
              delayMs = !next.done ? next.value : -1;
            }

            let retry = delayMs >= 0;

            if (options.maxRetries !== 0) retry &&= count < (options.maxRetries ?? 10);
            if (options.onErrors) retry &&= matchError(options.onErrors, error);
            if (options.neverOnErrors) retry &&= !matchError(options.neverOnErrors, error);
            if (options.predicate) retry &&= !!options.predicate(error, count);
            if (options.stopPredicate) retry &&= !options.stopPredicate(error, count);

            options.log?.(`retryWhile: ${retry ? 'retrying' : 'giving up'}`, {
              count,
              interval: delayMs,
              error,
            });

            return retry ? timer(delayMs) : throwError(error);
          }),
        ),
      ),
    );
}

/**
 * Receives an async function and returns an observable which will retry it every interval until it
 * resolves, or throw if it can't succeed after 10 retries.
 * It is needed e.g. on provider methods which perform RPC requests directly, as they can fail
 * temporarily due to network errors, so they need to be retried for a while.
 * JsonRpcProvider._doPoll also catches, suppresses & retry
 *
 * @param func - An async function (e.g. a Promise factory, like a defer callback)
 * @param retryWhileArgs - Rest arguments as received by [[retryWhile]] operator
 * @returns Observable version of async function, with retries
 */
export function retryAsync$<T>(
  func: () => ObservableInput<T>,
  ...retryWhileArgs: Parameters<typeof retryWhile>
): Observable<T> {
  return defer(func).pipe(retryWhile(...retryWhileArgs));
}

/**
 * RxJS operator to keep subscribed to input$ if condition is truty (or falsy, if negated),
 * unsubscribe if it becomes falsy, and re-subscribes if it becomes truty again (input$ must be
 * re-subscribable).
 *
 * @param cond$ - Condition observable
 * @param negate - Whether to negate condition
 *      (i.e. keep subscribed while falsy, unsubscribe when truty)
 * @returns monotype operator to unsubscribe and re-subscribe to source/input based on confition
 */
export function takeIf<T>(
  cond$: Observable<unknown>,
  negate = false,
): MonoTypeOperatorFunction<T> {
  const distinctCond$ = cond$.pipe(
    map((cond) => (negate ? !cond : !!cond)),
    distinctUntilChanged(),
  );
  return (input$) =>
    input$.pipe(
      // unsubscribe input$ when cond becomes falsy
      takeUntil(distinctCond$.pipe(filter((cond): cond is false => !cond))),
      // re-subscribe input$ when cond becomes truty
      repeatWhen(() => distinctCond$.pipe(filter((cond): cond is true => cond))),
      completeWith(input$),
    );
}

/**
 * Complete an input when another observable completes
 *
 * @param complete$ - Observable which will complete input when completed
 * @param delayMs - Delay completion by some time after complete$ completes
 * @returns Operator returning observable mirroring input, but completes when complete$ completes
 */
export function completeWith<T>(
  complete$: Observable<unknown>,
  delayMs?: number,
): MonoTypeOperatorFunction<T> {
  return (input$) => {
    let output$ = input$.pipe(takeUntil(complete$.pipe(ignoreElements(), endWith(null))));
    if (delayMs !== undefined) output$ = output$.pipe(delay(delayMs));
    return output$;
  };
}

/**
 * Like a mergeMap which only subscribes to the inner observable once the input completes;
 * Intermediary values are ignored; project receives optionally the last value emitted by input,
 * or null if no value was emitted
 *
 * @param project - callback to generate the inner observable, receives last emitted value or null
 * @returns Operator returning observable mirroring inner observable
 */
export function lastMap<T, R>(
  project: (lastValue: T | null) => ObservableInput<R>,
): OperatorFunction<T, R> {
  return (input$) => {
    return input$.pipe(last(undefined, null), mergeMap(project));
  };
}

/**
 * Like timeout rxjs operator, but applies only on first emition
 *
 * @param timeout - Timeout to wait for an item flow through input
 * @returns Operator function
 */
export function timeoutFirst<T>(timeout: number): MonoTypeOperatorFunction<T> {
  return (input$) =>
    race(timer(timeout).pipe(mergeMapTo(throwError(new Error('timeout waiting first')))), input$);
}

/**
 * Like a concatMap, but input values emitted while a subscription is active are buffered and
 * passed to project callback as an array when previous subscription completes.
 * This means a value emitted by input while there's no active subscription will cause project to
 * be called with a single-element array (value), while multiple values going through will get
 * buffered and project called with all of them only once previous completes.
 *
 * @param project - Callback to generate the inner ObservableInput
 * @param maxBatchSize - Limit emitted batches to this size; non-emitted values will stay in queue
 * and be passed on next project call and subscription
 * @returns Observable of values emitted by inner subscription
 */
export function concatBuffer<T, R>(
  project: (values: [T, ...T[]]) => ObservableInput<R>,
  maxBatchSize?: number,
): OperatorFunction<T, R> {
  return (input$) => {
    const buffer: T[] = [];
    return input$.pipe(
      tap((value) => buffer.push(value)),
      concatMap(() =>
        defer(() =>
          buffer.length
            ? project(buffer.splice(0, maxBatchSize ?? buffer.length) as [T, ...T[]])
            : EMPTY,
        ),
      ),
    );
  };
}

/**
 * Flatten the merging of higher-order observables but preserving previous value
 *
 * It's like [[withLatestFrom]], but don't lose outter values and merges all inner emitted ones.
 * Instead of the callback-hell of:
 *   obs1.pipe(
 *     mergeMap((v1) =>
 *       obs2(v1).pipe( // obs2 uses v1
 *         mergeMap((v2) =>
 *           obs3(v1, v2).pipe( // obs3 uses v1, v2
 *             map(({ v3_a, v3_b }) => { v1, v2, v3: v3_a + v3_b }), // map uses v1, v2, v3
 *           ),
 *         ),
 *       ),
 *     ),
 *   );
 *
 * You can now:
 *   obs1.pipe(
 *     mergeWith((v1) => obs2(v1, 123)),
 *     mergeWith(([v1, v2]) => obs3(v1, v2, true)),
 *     // you can use tuple-destructuring on values, and obj-destructuring on objects
 *     map(([[v1, v2], { v3_a, v3_b }]) => ({ v1, v2, v3: v3_a + v3_b })),
 *   );
 *
 * @param project - Project function passed to mergeMap
 * @param mapFunc - Funtion to merge result with, like mergeMap or switchMap
 * @returns Observable mirroring project's return, but prepending emitted values from this inner
 *    observable in a tuple with the value from the outter observable which generated the inner.
 */
export function mergeWith<T, R>(
  project: (value: T, index: number) => ObservableInput<R>,
  mapFunc = mergeMap,
): OperatorFunction<T, [T, R]> {
  return (input$) =>
    input$.pipe(
      mapFunc((value, index) =>
        from(project(value, index)).pipe(map((res) => [value, res] as [T, R])),
      ),
    );
}
