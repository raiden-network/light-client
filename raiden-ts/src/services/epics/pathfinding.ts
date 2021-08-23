import { BigNumber } from '@ethersproject/bignumber';
import isEmpty from 'lodash/isEmpty';
import isEqual from 'lodash/isEqual';
import pickBy from 'lodash/pickBy';
import type { Observable } from 'rxjs';
import { AsyncSubject, combineLatest, defer, EMPTY, from, of, timer } from 'rxjs';
import {
  catchError,
  concatMap,
  debounce,
  distinctUntilChanged,
  filter,
  first,
  map,
  mergeMap,
  pairwise,
  pluck,
  startWith,
  switchMap,
  takeUntil,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import { newBlock } from '../../channels/actions';
import { ChannelState } from '../../channels/state';
import { channelAmounts, groupChannel } from '../../channels/utils';
import { Capabilities } from '../../constants';
import { messageServiceSend } from '../../messages/actions';
import type { PFSCapacityUpdate, PFSFeeUpdate } from '../../messages/types';
import { MessageType } from '../../messages/types';
import { signMessage } from '../../messages/utils';
import type { RaidenState } from '../../state';
import { makeMessageId } from '../../transfers/utils';
import { matrixPresence } from '../../transport/actions';
import { getCap } from '../../transport/utils';
import type { RaidenEpicDeps } from '../../types';
import { isActionOf } from '../../utils/actions';
import { fromEthersEvent, logToContractEvent } from '../../utils/ethers';
import { completeWith, dispatchRequestAndGetResponse, pluckDistinct } from '../../utils/rx';
import type { UInt } from '../../utils/types';
import type { iouClear, iouPersist } from '../actions';
import { pathFind, servicesValid } from '../actions';
import { PfsMode, Service } from '../types';
import { getRoute$, makeTimestamp, validateRoute$ } from './helpers';

/**
 * Check if a transfer can be made and return a set of paths for it.
 *
 * @param action$ - Observable of pathFind.request actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps object
 * @returns Observable of pathFind.{success|failure} actions
 */
export function pfsRequestEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<
  matrixPresence.request | pathFind.success | pathFind.failure | iouPersist | iouClear
> {
  return action$.pipe(
    dispatchRequestAndGetResponse(matrixPresence, (dispatch) =>
      action$.pipe(
        filter(isActionOf(pathFind.request)),
        concatMap((action) =>
          dispatch(matrixPresence.request(undefined, { address: action.meta.target })).pipe(
            withLatestFrom(deps.latest$),
            mergeMap(([targetPresence, latest]) =>
              getRoute$(action, deps, latest, targetPresence),
            ),
            withLatestFrom(deps.latest$),
            mergeMap(([route, { state }]) => validateRoute$([action, route], state, deps)),
            catchError((err) => of(pathFind.failure(err, action.meta))),
          ),
        ),
      ),
    ),
  );
}

/**
 * Sends a [[PFSCapacityUpdate]] to PFSs on new deposit on our side of channels
 *
 * @param action$ - Observable of channelDeposit.success actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.log - Logger instance
 * @param deps.address - Our address
 * @param deps.network - Current Network
 * @param deps.signer - Signer instance
 * @param deps.config$ - Config observable
 * @returns Observable of messageServiceSend.request actions
 */
export function pfsCapacityUpdateEpic(
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { log, address, network, signer, config$ }: RaidenEpicDeps,
): Observable<messageServiceSend.request> {
  return state$.pipe(
    groupChannel(),
    mergeMap((grouped$) =>
      grouped$.pipe(
        pairwise(), // skips first emission on startup
        withLatestFrom(config$),
        // ignore actions if channel not open or while/if pfs is disabled
        filter(
          ([[, channel], { pfsMode }]) =>
            channel.state === ChannelState.open && pfsMode !== PfsMode.disabled,
        ),
        debounce(
          ([[prev, cur], { httpTimeout }]) =>
            cur.own.locks.length > prev.own.locks.length ||
            cur.partner.locks.length > prev.partner.locks.length
              ? // if either lock increases, a transfer is pending, debounce by httpTimeout=30s
                timer(httpTimeout)
              : of(1), // otherwise, deposited or a transfer completed, fires immediatelly
        ),
        switchMap(([[, channel], { revealTimeout }]) => {
          const tokenNetwork = channel.tokenNetwork;
          const partner = channel.partner.address;
          const { ownCapacity, partnerCapacity } = channelAmounts(channel);

          const message: PFSCapacityUpdate = {
            type: MessageType.PFS_CAPACITY_UPDATE,
            canonical_identifier: {
              chain_identifier: BigNumber.from(network.chainId) as UInt<32>,
              token_network_address: tokenNetwork,
              channel_identifier: BigNumber.from(channel.id) as UInt<32>,
            },
            updating_participant: address,
            other_participant: partner,
            updating_nonce: channel.own.balanceProof.nonce,
            other_nonce: channel.partner.balanceProof.nonce,
            updating_capacity: ownCapacity,
            other_capacity: partnerCapacity,
            reveal_timeout: BigNumber.from(revealTimeout) as UInt<32>,
          };
          const msgId = makeMessageId().toString();

          return defer(() => signMessage(signer, message, { log })).pipe(
            map((signed) =>
              messageServiceSend.request({ message: signed }, { service: Service.PFS, msgId }),
            ),
            catchError((err) => {
              log.error('Error trying to generate & sign PFSCapacityUpdate', err);
              return EMPTY;
            }),
          );
        }),
      ),
    ),
  );
}

/**
 * When monitoring a channel (either a new channel or a previously monitored one), send a matching
 * PFSFeeUpdate to PFSs, so they can pick us for mediation
 *
 * @param action$ - Observable of channelMonitored actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Raiden epic dependencies
 * @param deps.log - Logger instance
 * @param deps.address - Our address
 * @param deps.network - Current network
 * @param deps.signer - Signer instance
 * @param deps.config$ - Config observable
 * @param deps.mediationFeeCalculator - Calculator for mediation fees schedule
 * @returns Observable of messageServiceSend.request actions
 */
export function pfsFeeUpdateEpic(
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { log, address, network, signer, config$, mediationFeeCalculator }: RaidenEpicDeps,
): Observable<messageServiceSend.request> {
  return state$.pipe(
    groupChannel(),
    mergeMap((grouped$) =>
      combineLatest([
        grouped$,
        config$.pipe(pluckDistinct('caps')),
        config$.pipe(pluckDistinct('mediationFees')),
      ]).pipe(
        filter(([, caps]) => !!getCap(caps, Capabilities.MEDIATE)),
        map(([channel, , mediationFees]) => {
          const schedule: PFSFeeUpdate['fee_schedule'] = mediationFeeCalculator.schedule(
            mediationFees,
            channel,
          );
          // using channel feeSchedule above, build a PFSFeeUpdate's schedule payload
          return [channel, schedule] as const;
        }),
        // reactive on channel state and config changes, distinct on schedule's payload
        distinctUntilChanged(([, sched1], [, sched2]) => isEqual(sched1, sched2)),
        switchMap(([channel, schedule]) => {
          const message: PFSFeeUpdate = {
            type: MessageType.PFS_FEE_UPDATE,
            canonical_identifier: {
              chain_identifier: BigNumber.from(network.chainId) as UInt<32>,
              token_network_address: channel.tokenNetwork,
              channel_identifier: BigNumber.from(channel.id) as UInt<32>,
            },
            updating_participant: address,
            timestamp: makeTimestamp(),
            fee_schedule: schedule,
          };
          const msgId = makeMessageId().toString();
          const meta = { service: Service.PFS, msgId };

          return from(signMessage(signer, message, { log })).pipe(
            map((signed) => messageServiceSend.request({ message: signed }, meta)),
            catchError((err) => {
              log.error('Error trying to generate & sign PFSFeeUpdate', err);
              return EMPTY;
            }),
          );
        }),
        takeUntil(grouped$.pipe(filter((channel) => channel.state !== ChannelState.open))),
      ),
    ),
    completeWith(state$),
  );
}

/**
 * Fetch & monitors ServiceRegistry's RegisteredService events, keep track of valid_till expiration
 * and aggregate list of valid service addresses
 *
 * Notice this epic only deals with the events & addresses, and don't fetch URLs, which need to be
 * fetched on-demand through [[pfsInfo]] & [[pfsListInfo]].
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps object
 * @param deps.provider - Provider instance
 * @param deps.serviceRegistryContract - ServiceRegistry contract instance
 * @param deps.contractsInfo - Contracts info mapping
 * @param deps.config$ - Config observable
 * @param deps.init$ - Init$ tasks subject
 * @returns Observable of servicesValid actions
 */
export function pfsServiceRegistryMonitorEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { provider, serviceRegistryContract, contractsInfo, config$, init$ }: RaidenEpicDeps,
): Observable<servicesValid> {
  const blockNumber$ = action$.pipe(filter(newBlock.is), pluck('payload', 'blockNumber'));
  return state$.pipe(
    first(),
    switchMap(({ services: initialServices }) => {
      const initSub = new AsyncSubject<null>();
      init$.next(initSub);
      return fromEthersEvent(
        provider,
        serviceRegistryContract.filters.RegisteredService(null, null, null, null),
        {
          // if initialServices is empty, fetch since registry deploy block, else, resetEventsBlock
          fromBlock: isEmpty(initialServices)
            ? contractsInfo.TokenNetworkRegistry.block_number
            : undefined,
          confirmations: config$.pipe(pluck('confirmationBlocks')),
          blockNumber$,
          onPastCompleted: () => {
            initSub.next(null);
            initSub.complete();
          },
        },
      ).pipe(
        withLatestFrom(state$, config$),
        filter(
          ([{ blockNumber: eventBlock }, { blockNumber }, { confirmationBlocks }]) =>
            !!eventBlock && eventBlock + confirmationBlocks <= blockNumber,
        ),
        pluck(0),
        map(logToContractEvent(serviceRegistryContract)),
        withLatestFrom(state$),
        // merge new entry with stored state
        map(([[service, valid_till], { services }]) => ({
          ...services,
          [service]: valid_till.toNumber() * 1000,
        })),
        startWith(initialServices),
        // switchMap with newBlock events ensure this filter gets re-evaluated every block
        // and filters out entries which aren't valid anymore
        switchMap((services) =>
          action$.pipe(
            filter(newBlock.is),
            startWith(true),
            map(() => pickBy(services, (till) => Date.now() < till)),
          ),
        ),
      );
    }),
    distinctUntilChanged<RaidenState['services']>(isEqual),
    map((valid) => servicesValid(valid)),
    completeWith(action$),
  );
}
