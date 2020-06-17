/* eslint-disable @typescript-eslint/no-namespace */
import * as t from 'io-ts';

import { createAction, ActionType, createAsyncAction } from '../utils/actions';
import { Address, UInt, Signed, Hash } from '../utils/types';
import { Paths, PFS, IOU } from './types';

const PathId = t.type({
  tokenNetwork: Address,
  target: Address,
  value: UInt(32),
});

const ServiceId = t.type({
  tokenNetwork: Address,
  serviceAddress: Address,
});

export const pathFind = createAsyncAction(
  PathId,
  'path/find/request',
  'path/find/success',
  'path/find/failure',
  t.partial({ paths: Paths, pfs: t.union([PFS, t.null]) }),
  t.type({ paths: Paths }),
);

export namespace pathFind {
  export interface request extends ActionType<typeof pathFind.request> {}
  export interface success extends ActionType<typeof pathFind.success> {}
  export interface failure extends ActionType<typeof pathFind.failure> {}
}

export const pfsListUpdated = createAction(
  'pfs/list/updated',
  t.type({ pfsList: t.readonlyArray(Address) }),
);
export interface pfsListUpdated extends ActionType<typeof pfsListUpdated> {}

export const iouPersist = createAction('iou/persist', t.type({ iou: Signed(IOU) }), ServiceId);
export interface iouPersist extends ActionType<typeof iouPersist> {}

export const iouClear = createAction('iou/clear', undefined, ServiceId);
export interface iouClear extends ActionType<typeof iouClear> {}

export const udcDeposited = createAction('udc/deposited', UInt(32));
export interface udcDeposited extends ActionType<typeof udcDeposited> {}

const UdcWithdrawId = t.type({
  amount: UInt(32),
});

export const udcWithdraw = createAsyncAction(
  UdcWithdrawId,
  'udc/withdraw/request',
  'udc/withdraw/success',
  'udc/withdraw/failure',
  t.undefined,
  t.intersection([
    t.type({ block: t.number }),
    t.partial({ txHash: Hash, txBlock: t.number, confirmed: t.union([t.undefined, t.boolean]) }),
  ]),
);

export namespace udcWithdraw {
  export interface request extends ActionType<typeof udcWithdraw.request> {}
  export interface success extends ActionType<typeof udcWithdraw.success> {}
  export interface failure extends ActionType<typeof udcWithdraw.failure> {}
}

export const udcWithdrawn = createAction(
  'udc/withdrawn',
  t.type({
    withdrawal: UInt(32),
    txHash: Hash,
    txBlock: t.number,
    confirmed: t.union([t.undefined, t.boolean]),
  }),
  UdcWithdrawId,
);

export interface udcWithdrawn extends ActionType<typeof udcWithdrawn> {}

export const msBalanceProofSent = createAction(
  'ms/balanceProof/sent',
  t.type({
    tokenNetwork: Address,
    partner: Address,
    id: t.number,
    reward: UInt(32),
    nonce: UInt(8),
    monitoringService: Address,
    txHash: Hash,
    txBlock: t.number,
    confirmed: t.union([t.undefined, t.boolean]),
  }),
);
export interface msBalanceProofSent extends ActionType<typeof msBalanceProofSent> {}
