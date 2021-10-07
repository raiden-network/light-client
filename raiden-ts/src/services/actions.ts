/* eslint-disable @typescript-eslint/no-namespace */
import * as t from 'io-ts';

import type { ActionType } from '../utils/actions';
import { createAction, createAsyncAction } from '../utils/actions';
import { Address, Hash, Signed, UInt } from '../utils/types';
import { InputPaths, IOU, Paths, PFS, ServicesValidityMap } from './types';

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
  'path/find',
  t.partial({ paths: InputPaths, pfs: t.union([PFS, t.null]) }),
  t.type({ paths: Paths }),
);
export namespace pathFind {
  export interface request extends ActionType<typeof pathFind.request> {}
  export interface success extends ActionType<typeof pathFind.success> {}
  export interface failure extends ActionType<typeof pathFind.failure> {}
}

export const servicesValid = createAction('services/valid', ServicesValidityMap);
export interface servicesValid extends ActionType<typeof servicesValid> {}

export const iouPersist = createAction('iou/persist', t.type({ iou: Signed(IOU) }), ServiceId);
export interface iouPersist extends ActionType<typeof iouPersist> {}

export const iouClear = createAction('iou/clear', undefined, ServiceId);
export interface iouClear extends ActionType<typeof iouClear> {}

export const udcDeposit = createAsyncAction(
  t.type({ totalDeposit: UInt(32) }),
  'udc/deposit',
  t.type({ deposit: UInt(32) }),
  t.union([
    t.type({ balance: UInt(32) }),
    t.type({
      balance: UInt(32),
      txHash: Hash,
      txBlock: t.number,
      confirmed: t.union([t.undefined, t.boolean]),
    }),
  ]),
);
export namespace udcDeposit {
  export interface request extends ActionType<typeof udcDeposit.request> {}
  export interface success extends ActionType<typeof udcDeposit.success> {}
  export interface failure extends ActionType<typeof udcDeposit.failure> {}
}

const UdcWithdrawId = t.type({
  amount: UInt(32),
});

export const udcWithdrawPlan = createAsyncAction(
  UdcWithdrawId,
  'udc/withdraw/plan',
  t.undefined,
  t.intersection([
    t.type({ block: t.number }),
    t.partial({ txHash: Hash, txBlock: t.number, confirmed: t.union([t.undefined, t.boolean]) }),
  ]),
);
export namespace udcWithdrawPlan {
  export interface request extends ActionType<typeof udcWithdrawPlan.request> {}
  export interface success extends ActionType<typeof udcWithdrawPlan.success> {}
  export interface failure extends ActionType<typeof udcWithdrawPlan.failure> {}
}

export const udcWithdraw = createAsyncAction(
  UdcWithdrawId,
  'udc/withdraw',
  /**
   * subkey here isn't the msg.sender (as udc withdraws must always be sent from effective account)
   * but instead the beneficiary of the withdrawal
   */
  t.union([t.undefined, t.partial({ subkey: t.boolean })]),
  t.type({
    withdrawal: UInt(32),
    beneficiary: Address,
    txHash: Hash,
    txBlock: t.number,
    confirmed: t.union([t.undefined, t.boolean]),
  }),
);
export namespace udcWithdraw {
  export interface request extends ActionType<typeof udcWithdraw.request> {}
  export interface success extends ActionType<typeof udcWithdraw.success> {}
  export interface failure extends ActionType<typeof udcWithdraw.failure> {}
}

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
