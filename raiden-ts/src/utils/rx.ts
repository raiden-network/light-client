import type {
  MonoTypeOperatorFunction,
  Observable,
  ObservableInput,
  OperatorFunction,
} from 'rxjs';
import {
  defer,
  EMPTY,
  from,
  merge,
  partition,
  pipe,
  race,
  ReplaySubject,
  Subject,
  throwError,
  timer,
} from 'rxjs';
import {
  catchError,
  concatMap,
  delay,
  distinctUntilChanged,
  endWith,
  filter,
  finalize,
  ignoreElements,
  last,
  map,
  mergeMap,
  mergeMapTo,
  pluck,
  repeatWhen,
  retryWhen,
  scan,
  share,
  switchMap,
  takeUntil,
  takeWhile,
  tap,
} from 'rxjs/operators';

import type { ActionType, AnyAAC } from './actions';
import { isResponseOf } from './actions';
import { shouldRetryError } from './error';
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
export const pluckDistinct: typeof pluck = (...properties: string[]) =>
  pipe(pluck(...properties), distinctUntilChanged());

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
  return pipe(
    distinctUntilChanged(),
    mergeMap((map) => Object.entries(map)),
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
  return pipe(
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

/**
 * Operator to retry/re-subscribe input$ until a stopPredicate returns truthy or delayMs iterator
 * completes, waiting delayMs milliseconds between retries.
 * Input observable must be re-subscribable/retriable.
 *
 * @param interval - Interval, iterable or iterator of intervals to wait between retries;
 *    if it's an iterable, it resets (iterator recreated) if input$ emits
 * @param options - shouldRetryError options, conditions are ANDed
 * @returns Operator function to retry if stopPredicate not truthy waiting between retries
 */
export function retryWhile<T>(
  interval: number | Iterator<number> | Iterable<number>,
  options: Parameters<typeof shouldRetryError>[0] = {},
): MonoTypeOperatorFunction<T> {
  let iter: Iterator<number> | undefined;
  if (options.log) options = { ...options, log: options.log.bind(null, 'retryWhile') };
  let shouldRetry: ReturnType<typeof shouldRetryError>;
  return (input$) =>
    defer(() => {
      iter = undefined;
      shouldRetry = shouldRetryError(options);
      return from(input$).pipe(
        // if input$ emits, reset iter (only useful if delayMs is an Iterable) and shouldRetry func
        tap(() => {
          iter = undefined;
          shouldRetry = shouldRetryError(options);
        }),
        retryWhen((error$) =>
          error$.pipe(
            mergeMap((error) => {
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

              if (delayMs <= 0 || !shouldRetry(error)) throw error;
              return timer(delayMs);
            }),
          ),
        ),
      );
    });
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
 * unsubscribes from source if cond$ becomes falsy, and re-subscribes if it becomes truty again
 * (input$ must be re-subscribable). While subscribed to source$, completes when source$ completes,
 * otherwise, when cond$ completes (since source$ isn't subscribed then), so make sure cond$
 * completes too when desired, or the output observable may hang until unsubscribed.
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
  return (source$) => {
    const completed$ = new Subject<true>();
    return cond$.pipe(
      map((cond) => (negate ? !cond : !!cond)),
      distinctUntilChanged(),
      takeUntil(completed$),
      switchMap((cond) => {
        if (!cond) return EMPTY;
        return source$.pipe(tap({ complete: () => completed$.next(true) }));
      }),
    );
  };
}

/**
 * Complete an input when another observable completes
 *
 * @param complete$ - Observable which will complete input when completed
 * @param delayMs - Delay unsubscribing source by some time after complete$ completes
 * @returns Operator returning observable mirroring input, but completes when complete$ completes
 */
export function completeWith<T>(
  complete$: Observable<unknown>,
  delayMs?: number,
): MonoTypeOperatorFunction<T> {
  return (input$) => {
    complete$ = complete$.pipe(ignoreElements(), endWith(null));
    if (delayMs !== undefined) complete$ = complete$.pipe(delay(delayMs));
    return input$.pipe(takeUntil(complete$));
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
  return pipe(last(undefined, null), mergeMap(project));
}

/**
 * Like timeout rxjs operator, but applies only on first emition
 *
 * @param timeout - Timeout to wait for an item flow through input
 * @returns Operator function
 */
export function timeoutFirst<T>(timeout: number): MonoTypeOperatorFunction<T> {
  return (input$) =>
    race(
      timer(timeout).pipe(mergeMapTo(throwError(() => new Error('timeout waiting first')))),
      input$,
    );
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
  return pipe(
    mapFunc((value, index) =>
      from(project(value, index)).pipe(map((res) => [value, res] as [T, R])),
    ),
  );
}

/**
 * Operator to catch, log and suppress observable errors
 *
 * @param opts - shouldRetryError parameters
 * @param logParams - Additional log parameters, message and details to bind to opts.log
 * @returns Operator to catch errors, log and suppress if it matches the opts conditions,
 *    Re-throws otherwise
 */
export function catchAndLog<T>(
  opts: Parameters<typeof shouldRetryError>[0],
  ...logParams: unknown[]
): MonoTypeOperatorFunction<T> {
  if (opts.log && logParams.length) opts = { ...opts, log: opts.log.bind(null, ...logParams) };
  const shouldSuppress = shouldRetryError(opts);
  return pipe(
    catchError((err) => {
      if (!shouldSuppress(err)) throw err;
      return EMPTY;
    }),
  );
}

/**
 * Custom operator providing a project function which is mirrored in the output, but provides a
 * parameter function which allows submitting requests directly to the output as well, and returns
 * with an observable which filters input$ for success|failures, errors on failures and completes
 * on successes. In case 'confirmed' is true, this observable also emits intermediate unconfirmed
 * successes and only completes upon the confirmed one is seen.
 * Example:
 * output$: Observable<anotherAction.success | messageSend.request> = action$.pipe(
 *   dispatchRequestAndGetResponse(messageSend, (dispatchRequest) =>
 *     // this observable will be mirrored to output, plus requests sent to dispatchRequest
 *     action$.pipe(
 *       filter(anotherAction.request.is),
 *       mergeMap((action) =>
 *         dispatchRequest(messageSend.request('test')).pipe(
 *           map((sentAction) => anotherAction.success({ sent: msgSendSucAction })),
 *         ),
 *       ),
 *     ),
 *   ),
 * )
 *
 * @param aac - AsyncActionCreator type to wait for response; can be an array of action creators,
 *      in which case, dispatchRequest function will accept one request and return an observable
 *      for the corresponding response
 * @param project - Function to be merged to output; called with a function which allows to
 *      dispatch requests directly to output and returns an observable which will emit the success
 *      coming in input and complete, or error if a failure goes through
 * @param confirmed - Keep emitting success to dispatchRequest's returned observable while it isn't
 *      confirmed yet
 * @param dedupKey - Function to calculate keys to deduplicate requests (returns the same
        observable as result if a request with similar key is performed while one is still pending)
 * @returns Custom operator which mirrors projected observable plus requests called in the
 *      project's function parameter
 */
export function dispatchRequestAndGetResponse<T, AAC extends AnyAAC, R>(
  aac: AAC,
  project: (
    dispatchRequest: <A extends AAC>(
      request: ActionType<A['request']>,
    ) => Observable<ActionType<A['success']>>,
  ) => ObservableInput<R>,
  confirmed = false,
  dedupKey = (value: ActionType<AAC['request']>): unknown => value,
): OperatorFunction<T, R | ActionType<AAC['request']>> {
  return (input$) =>
    defer(() => {
      const requestOutput$ = new Subject<ActionType<AAC['request']>>();
      const pending = new Map<unknown, Observable<ActionType<AAC['success']>>>();
      const projectOutput$ = defer(() =>
        project((request) => {
          const key = dedupKey(request);
          const pending$ = pending.get(key);
          if (pending$) return pending$;
          const result$ = new ReplaySubject<ActionType<AAC['success']>>(1);
          const sub = input$
            .pipe(
              filter(isResponseOf<AAC>(aac, request.meta)),
              map((response) => {
                if (aac.failure.is(response)) throw response.payload;
                return response;
              }),
              takeWhile(
                (response) =>
                  confirmed &&
                  'confirmed' in response.payload &&
                  response.payload.confirmed === undefined,
                true,
              ),
            )
            .subscribe(result$);
          requestOutput$.next(request);
          const res = result$.pipe(
            finalize(() => {
              sub.unsubscribe();
              pending.delete(key);
            }),
          );
          pending.set(key, res);
          return res;
        }),
      ).pipe(finalize(() => requestOutput$.complete()));
      return merge(requestOutput$, projectOutput$);
    });
}

/**
 * A custom operator to apply an inner operator only to a partitioned (filtered) view of the input,
 * matching a given predicate, and merging the output with the values which doesn't match it
 *
 * @param predicate - Test input values if they should be projected
 * @param operator - Receives observable of input values which matches predicate and return an
 *      observable input to be merged in the output together with values which don't
 * @returns Observable of values which doesn't pass the predicate merged with the projected
 *      observables returned on the values which pass
 */
export function partitionMap<T, U, R>(
  predicate: (value: unknown) => value is T,
  operator: (input$: Observable<T>) => ObservableInput<R>,
): OperatorFunction<T | U, Exclude<T | U, T> | R> {
  return (source$) => {
    const [true$, false$] = partition(source$.pipe(share<T | U>()), predicate) as [
      Observable<T>,
      Observable<Exclude<T | U, T>>,
    ];
    return merge(operator(true$), false$);
  };
}
