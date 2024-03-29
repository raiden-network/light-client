import { BigNumber } from '@ethersproject/bignumber';
import * as t from 'io-ts';
import { from } from 'rxjs';

import { ConfirmableAction } from '@/actions';
import { channelDeposit, channelMonitored } from '@/channels/actions';
import type { ActionType } from '@/utils/actions';
import {
  asyncActionToPromise,
  createAction,
  createAsyncAction,
  createReducer,
  isActionOf,
  isResponseOf,
} from '@/utils/actions';
import { ErrorCodec, ErrorCodes, RaidenError } from '@/utils/error';
import type { Address, UInt } from '@/utils/types';
import { decode } from '@/utils/types';

describe('action factories not tested in reducers.spec.ts', () => {
  const tokenNetwork = '0x0000000000000000000000000000000000020001' as Address,
    partner = '0x0000000000000000000000000000000000000020' as Address;
  test('channelMonitored', () => {
    const id = 12;
    expect(channelMonitored({ id }, { tokenNetwork, partner })).toEqual({
      type: channelMonitored.type,
      payload: { id },
      meta: { tokenNetwork, partner },
    });
  });

  test('channelDeposit request', () => {
    const deposit = BigNumber.from(999) as UInt<32>;
    expect(channelDeposit.request({ deposit }, { tokenNetwork, partner })).toEqual({
      type: channelDeposit.request.type,
      payload: { deposit },
      meta: { tokenNetwork, partner },
    });
  });

  test('channelDeposit failed', () => {
    const error = new RaidenError(ErrorCodes.RDN_DEPOSIT_TRANSACTION_FAILED);
    expect(channelDeposit.failure(error, { tokenNetwork, partner })).toEqual({
      type: channelDeposit.failure.type,
      payload: error,
      meta: { tokenNetwork, partner },
      error: true,
    });
  });
});

describe('utils/actions', () => {
  test('createAction + isActionOf + ActionType', () => {
    const actionT = createAction('TEST1');
    const actionTP = createAction('TEST2', t.type({ a: t.number }));
    const actionTPM = createAction('TEST3', t.type({ a: t.number }), t.type({ m: t.string }));
    const actionTM = createAction('TEST4', undefined, t.type({ m: t.string }));
    const actionTE = createAction('TEST5', undefined, undefined, true);
    const actionTPE = createAction('TEST6', t.type({ a: t.number }), undefined, true);
    const actionTPME = createAction(
      'TEST7',
      t.type({ a: t.number }),
      t.type({ m: t.string }),
      true,
    );
    const actionTME = createAction('TEST8', undefined, t.type({ m: t.string }), true);
    const actionUnd = createAction('TEST_U', t.union([t.type({ a: t.number }), t.undefined]));

    const actionFailed = createAction(
      'TEST_FAILED',
      ErrorCodec,
      t.type({ context: t.string }),
      true,
    );

    expect(actionT.type).toBe('TEST1');
    expect(actionTPME.error).toBe(true);
    expect(actionFailed.error).toBe(true);

    expect(actionT()).toStrictEqual({ type: 'TEST1' });
    expect(actionTP({ a: 1 })).toStrictEqual({ type: 'TEST2', payload: { a: 1 } });
    expect(actionTPM({ a: 1 }, { m: 'abc' })).toStrictEqual({
      type: 'TEST3',
      payload: { a: 1 },
      meta: { m: 'abc' },
    });
    expect(actionTM(undefined, { m: 'abc' })).toStrictEqual({ type: 'TEST4', meta: { m: 'abc' } });
    expect(actionTE()).toStrictEqual({ type: 'TEST5', error: true });
    expect(actionTPE({ a: 1 })).toStrictEqual({ type: 'TEST6', payload: { a: 1 }, error: true });
    expect(actionTPME({ a: 1 }, { m: 'abc' })).toStrictEqual({
      type: 'TEST7',
      payload: { a: 1 },
      meta: { m: 'abc' },
      error: true,
    });
    expect(actionTME(undefined, { m: 'abc' })).toStrictEqual({
      type: 'TEST8',
      meta: { m: 'abc' },
      error: true,
    });

    // test action with payload unioned with undefined
    expect(actionUnd({ a: 1 })).toStrictEqual({ type: 'TEST_U', payload: { a: 1 } });
    expect(actionUnd(undefined)).toStrictEqual({ type: 'TEST_U', payload: undefined });
    expect(actionUnd.is(actionUnd(undefined))).toBe(true);

    try {
      throw new RaidenError(ErrorCodes.RDN_GENERAL_ERROR);
    } catch (e) {
      expect(actionFailed(e as Error, { context: 'init' })).toStrictEqual({
        type: 'TEST_FAILED',
        payload: expect.any(RaidenError),
        meta: { context: 'init' },
        error: true,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a1: any = {
      type: 'TEST7',
      payload: { a: 1 },
      meta: { m: 'metaOfTest7' },
      error: true,
    };

    // type narrowing
    let b1: ActionType<typeof actionTPME>;
    expect(actionTPME.is(a1)).toBe(true);
    if (actionTPME.is(a1)) {
      b1 = a1;
      expect(b1).toStrictEqual(a1);
    }

    expect(isActionOf(actionTPME, a1)).toBe(true);

    expect(isActionOf([actionTM, actionTPM, actionTME, actionTPME])(a1)).toBe(true);
    if (isActionOf([actionTM, actionTPM, actionTME, actionTPME])(a1)) {
      // can access member of union
      expect(a1.meta).toStrictEqual({ m: 'metaOfTest7' });
    }

    expect(decode(actionTPME.codec, a1)).toEqual(a1);
  });

  test('createAsyncAction', async () => {
    const asyncAction = createAsyncAction(
      t.type({ id: t.number }),
      'test',
      t.partial({ query: t.string }),
      t.boolean,
    );

    const req: ActionType<typeof asyncAction.request> = asyncAction.request({}, { id: 123 });
    expect(req).toStrictEqual({
      type: 'test/request',
      payload: {},
      meta: { id: 123 },
    });

    const success = asyncAction.success(true, { id: 456 });
    expect(success).toStrictEqual({
      type: 'test/success',
      payload: true,
      meta: { id: 456 },
    });

    // isResponseOf
    expect(isResponseOf(asyncAction, req.meta, success)).toBe(false);

    const err = new RaidenError(ErrorCodes.RDN_GENERAL_ERROR);
    const fail: ActionType<typeof asyncAction.failure> = asyncAction.failure(err, {
      id: 123,
    });
    expect(fail).toStrictEqual({
      type: 'test/failure',
      payload: err,
      meta: { id: 123 },
      error: true,
    });

    // ActionType of AsyncActionCreator is union of actions
    const arr: ActionType<typeof asyncAction>[] = [success, fail];
    const responseFilter = isResponseOf(asyncAction, req.meta);
    expect(arr.filter(responseFilter)).toEqual([fail]);

    // asyncActionToPromise
    let action$ = from([success, fail]);
    await expect(asyncActionToPromise(asyncAction, req.meta, action$)).rejects.toThrow(
      ErrorCodes.RDN_GENERAL_ERROR,
    );

    action$ = from([asyncAction.success(true, { id: 123 }), fail]);
    await expect(asyncActionToPromise(asyncAction, req.meta, action$)).resolves.toBe(true);
  });

  test('createReducer', () => {
    const incrementBy = createAction('INCREMENT_BY', t.number);
    const decrement = createAction('DECREMENT');
    const noop = createAction('NOOP');

    const reducer0 = createReducer(0);
    expect(reducer0(10, incrementBy(5))).toBe(10);
    expect(reducer0(9, decrement())).toBe(9);
    expect(reducer0(8, noop())).toBe(8);

    const reducer1 = reducer0
      .handle(incrementBy, (s, { payload }) => s + payload)
      .handle(decrement, (s) => s - 1);
    expect(reducer1(undefined, incrementBy(5))).toBe(5);
    expect(reducer1(9, decrement())).toBe(8);
    expect(reducer1(8, noop())).toBe(8);

    const sqrReducer = createReducer('').handle(
      [decrement, noop],
      (s, { type }) => `${s}:${type}`, // action is union of either decrement or noop
    );
    expect(sqrReducer(undefined, incrementBy(5))).toBe(''); // unhandled
    expect(sqrReducer('', decrement())).toBe(`:${decrement.type}`);
    expect(sqrReducer('_', noop())).toBe(`_:${noop.type}`);

    // const reducer2 = reducer1.handle(decrement, s => s - 1); // forbidden, already handled
    // const reducer3 = sqrReducer.handle(noop, s => s); // forbidden, already handled
  });
});

test('ConfirmableAction', () => {
  // a ConfirmableAction with BigNumber members
  const action = {
    type: channelDeposit.success.type,
    payload: {
      id: 17,
      participant: '0x0000000000000000000000000000000000020001',
      totalDeposit: '255',
      txHash: '0x0000000000000000000000000000000000000020111111111111111111111111',
      txBlock: 121,
      // confirmed: undefined, // to test undefined property is filled
    },
    meta: {
      tokenNetwork: '0x0000000000000000000000000000000000020001',
      partner: '0x0000000000000000000000000000000000000020',
    },
  };
  const decoded = decode(channelDeposit.success.codec, action);

  // ensure actual action/codec validates above object
  expect(channelDeposit.success.is(decoded)).toBe(true);
  expect(channelDeposit.success.codec.is(decoded)).toBe(true);
  expect(channelDeposit.success.codec.encode(decoded)).toEqual(action);

  // ensure ConfirmableAction codec encodes/decodes exactly like the action codec
  expect(ConfirmableAction.is(decoded)).toBe(true);
  expect(decode(ConfirmableAction, action)).toEqual(decoded);
  expect(ConfirmableAction.encode(decoded)).toEqual(action);

  // ensure decoding<=>encoding roundtrips with just ConfirmableAction doesn't change object
  expect(ConfirmableAction.encode(decode(ConfirmableAction, action))).toEqual(action);
  expect(decode(ConfirmableAction, ConfirmableAction.encode(decoded))).toEqual(decoded);

  // notice this is a valid 'ConfirmableAction' (per pure codec), but not a valid action of that
  // type, and decoding must validate as false
  const confirmable: ConfirmableAction = { type: decoded.type, payload: decoded.payload };
  expect(() => decode(ConfirmableAction, confirmable)).toThrowError(/Invalid value.*\/meta:/);

  // same, but with an unknown type
  const confirmable2: ConfirmableAction = { type: 'unknown/action', payload: decoded.payload };
  expect(() => decode(ConfirmableAction, confirmable2)).toThrowError(
    /Invalid value.*ConfirmableAction/,
  );
});
