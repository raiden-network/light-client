import { Observable, OperatorFunction, pairs } from 'rxjs';
import { pluck, distinctUntilChanged, mergeMap, scan, filter } from 'rxjs/operators';
import { isntNil } from './types';

// overloads
export function pluckDistinct<T, K1 extends keyof T>(k1: K1): OperatorFunction<T, T[K1]>;
export function pluckDistinct<T, K1 extends keyof T, K2 extends keyof T[K1]>(
  k1: K1,
  k2: K2,
): OperatorFunction<T, T[K1][K2]>;
export function pluckDistinct<
  T,
  K1 extends keyof T,
  K2 extends keyof T[K1],
  K3 extends keyof T[K1][K2]
>(k1: K1, k2: K2, k3: K3): OperatorFunction<T, T[K1][K2][K3]>;
export function pluckDistinct<
  T,
  K1 extends keyof T,
  K2 extends keyof T[K1],
  K3 extends keyof T[K1][K2],
  K4 extends keyof T[K1][K2][K3]
>(k1: K1, k2: K2, k3: K3, k4: K4): OperatorFunction<T, T[K1][K2][K3][K4]>;
export function pluckDistinct<
  T,
  K1 extends keyof T,
  K2 extends keyof T[K1],
  K3 extends keyof T[K1][K2],
  K4 extends keyof T[K1][K2][K3],
  K5 extends keyof T[K1][K2][K3][K4]
>(k1: K1, k2: K2, k3: K3, k4: K4, k5: K5): OperatorFunction<T, T[K1][K2][K3][K4][K5]>;
export function pluckDistinct<
  T,
  K1 extends keyof T,
  K2 extends keyof T[K1],
  K3 extends keyof T[K1][K2],
  K4 extends keyof T[K1][K2][K3],
  K5 extends keyof T[K1][K2][K3][K4],
  K6 extends keyof T[K1][K2][K3][K4][K5]
>(k1: K1, k2: K2, k3: K3, k4: K4, k5: K5, k6: K6): OperatorFunction<T, T[K1][K2][K3][K4][K5][K6]>;
export function pluckDistinct<T, R>(...properties: string[]): OperatorFunction<T, R>;
/**
 * Maps each source value (an object) to its specified nested property,
 * and emits only if the value changed since last emission
 *
 * It's a combination of `pluck` and `distinctUntilChanged` operators.
 *
 * @param properties - The nested properties to pluck from each source value (an object).
 * @returns A new Observable of property values from the source values.
 */
export function pluckDistinct<T, R>(...properties: string[]): OperatorFunction<T, R> {
  /**
   * @param source - Input observable
   * @returns Observable of plucked & distinct values
   */
  return (source: Observable<T>) =>
    source.pipe(pluck<T, R>(...properties), distinctUntilChanged());
}

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
