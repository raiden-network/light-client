import { Observable } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';

/**
 * Util to split a combineLatest tuple Observable to a tuple of Observables of each member
 * Util when combining observables to e.g. multicast, and then willing to handle them separately
 * inside the multicast selector.
 * @param tuple$ An Observable of tuples of up to 4 values
 * @returns 2-4-tuple of Observables reflecting each value of the tuple
 */
export function splitCombined<T1, T2, T3, T4>(
  tuple$: Observable<[T1, T2, T3?, T4?]>,
): [Observable<T1>, Observable<T2>, Observable<T3 | undefined>, Observable<T4 | undefined>] {
  return [
    tuple$.pipe(
      map(t => t[0]),
      distinctUntilChanged(),
    ),
    tuple$.pipe(
      map(t => t[1]),
      distinctUntilChanged(),
    ),
    tuple$.pipe(
      map(t => t[2]),
      distinctUntilChanged(),
    ),
    tuple$.pipe(
      map(t => t[3]),
      distinctUntilChanged(),
    ),
  ];
}
