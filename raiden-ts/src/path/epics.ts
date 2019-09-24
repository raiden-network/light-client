import { Observable, of, combineLatest, from } from 'rxjs';
import {
  filter,
  mergeMap,
  publishReplay,
  first,
  catchError,
  concatMap,
  map,
  withLatestFrom,
  reduce,
} from 'rxjs/operators';
import { fromFetch } from 'rxjs/fetch';
import { isActionOf, ActionType } from 'typesafe-actions';
import { isLeft } from 'fp-ts/lib/Either';
import { ThrowReporter } from 'io-ts/lib/ThrowReporter';

import { RaidenAction } from '../actions';
import { RaidenState } from '../state';
import { RaidenEpicDeps } from '../types';
import { getPresences$ } from '../transport/utils';
import { Address, UInt } from '../utils/types';
import { losslessStringify } from '../utils/data';
import { pathFind, pathFound, pathFindFailed } from './actions';
import { channelCanRoute } from './utils';
import { PathResults } from './types';

/**
 * Check if a transfer can be made and return a set of paths for it.
 *
 * @param action$ - Observable of pathFind actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of pathFound|pathFindFailed actions
 */
export const pathFindServiceEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { config$ }: RaidenEpicDeps,
): Observable<ActionType<typeof pathFound | typeof pathFindFailed>> =>
  combineLatest(state$, getPresences$(action$), config$).pipe(
    publishReplay(1, undefined, statePresencesConfig$ => {
      return action$.pipe(
        filter(isActionOf(pathFind)),
        concatMap(action =>
          statePresencesConfig$.pipe(
            first(),
            mergeMap(([state, presences, { pfs }]) => {
              const { tokenNetwork, target } = action.meta;
              if (!(tokenNetwork in state.channels))
                throw new Error(`PFS: unknown tokenNetwork ${tokenNetwork}`);
              if (!(target in presences) || !presences[target].payload.available)
                throw new Error(`PFS: target ${target} not available in transport`);
              // if pathFind received a metadata, pass it through to validation/cleanup
              if (action.payload.metadata) return of(action.payload.metadata);
              // else, if possible, use a direct transfer
              else if (
                channelCanRoute(state, presences, tokenNetwork, target, action.meta.value) === true
              )
                return of({ routes: [{ route: [state.address, target] }] });
              // else, request a route from PFS
              else if (pfs !== null) {
                // from all channels
                return from(Object.keys(state.channels[tokenNetwork]) as Address[]).pipe(
                  // filter partners that can receive (online, enough capacity, etc)
                  filter(
                    partner =>
                      channelCanRoute(
                        state,
                        presences,
                        tokenNetwork,
                        partner,
                        action.meta.value,
                      ) === true,
                  ),
                  // TODO: request pathFind once from ourselves instead of each partner
                  // this requires us updating the PFS with our outgoing capacity on each channel
                  mergeMap(partner =>
                    fromFetch(`${pfs}/api/v1/${tokenNetwork}/paths`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: losslessStringify({
                        from: partner,
                        to: target,
                        value: UInt(32).encode(action.meta.value),
                        max_paths: 10, // eslint-disable-line @typescript-eslint/camelcase
                      }),
                    }).pipe(
                      mergeMap(async response => {
                        if (!response.ok)
                          throw new Error(
                            `PFS: paths request: code=${
                              response.status
                            } => body=${await response.text()}`,
                          );
                        const decoded = PathResults.decode(await response.json());
                        if (isLeft(decoded)) throw ThrowReporter.report(decoded);
                        return decoded.right;
                      }),
                      // catch early so other output routes can have the change to succeed
                      catchError(err => {
                        console.error('PFS: request error - ignoring', err);
                        return of<PathResults>({ result: [] });
                      }),
                    ),
                  ),
                  reduce<PathResults, PathResults['result']>(
                    (acc, { result }) => [...acc, ...result],
                    [],
                  ),
                  map(result => ({
                    routes: result
                      .slice()
                      .sort(({ estimated_fee: a }, { estimated_fee: b }) => a - b)
                      .map(({ path }) => ({ route: path })),
                  })),
                );
              } else {
                throw new Error(`PFS disabled and no direct route available`);
              }
            }),
            withLatestFrom(statePresencesConfig$),
            // validate/cleanup received routes/metadata
            map(([{ routes: result }, [state, presences]]) => {
              const routes: { route: readonly Address[] }[] = [],
                invalidatedRecipients = new Set<Address>();
              for (let { route } of result) {
                // if route has us as first hop, cleanup/shift
                if (route[0] === state.address) route = route.slice(1);
                const recipient = route[0];
                // if this recipient was already invalidated in a previous iteration, skip
                if (invalidatedRecipients.has(recipient)) continue;
                // if we already found some valid route, allow only new routes through this peer
                const canTransferOrReason = !routes.length
                  ? channelCanRoute(
                      state,
                      presences,
                      action.meta.tokenNetwork,
                      recipient,
                      action.meta.value,
                    )
                  : recipient !== routes[0].route[0]
                  ? 'path: already selected another recipient'
                  : true;
                if (canTransferOrReason !== true) {
                  console.debug(
                    'Invalidated received route! Reason:',
                    canTransferOrReason,
                    'Route:',
                    route,
                  );
                  invalidatedRecipients.add(recipient);
                  continue;
                }
                routes.push({ route });
              }
              if (!routes.length) throw new Error(`PFS: validated routes are empty`);
              return pathFound({ metadata: { routes } }, action.meta);
            }),
            catchError(err => of(pathFindFailed(err, action.meta))),
          ),
        ),
      );
    }),
  );
