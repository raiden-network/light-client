import {
  Observable,
  OperatorFunction,
  pairs,
  MonoTypeOperatorFunction,
  defer,
  throwError,
  timer,
  race,
  ObservableInput,
} from 'rxjs';
import {
  pluck,
  distinctUntilChanged,
  mergeMap,
  scan,
  filter,
  repeatWhen,
  takeUntil,
  retryWhen,
  takeWhile,
  map,
  switchMap,
  mergeMapTo,
  tap,
} from 'rxjs/operators';
import { isntNil } from './types';
import { ErrorMatches, matchError } from './error';

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
    );
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
