import { Observable, OperatorFunction } from 'rxjs';
import { pluck, distinctUntilChanged } from 'rxjs/operators';

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
