/* eslint-disable @typescript-eslint/class-name-casing */
/* eslint-disable @typescript-eslint/no-namespace */
import * as t from 'io-ts';
import { from } from 'rxjs';
import { bigNumberify } from 'ethers/utils';

import {
  channelDeposit,
  channelDepositFailed,
  channelMonitored,
} from 'raiden-ts/channels/actions';
import { Address, UInt, ErrorCodec, decode } from 'raiden-ts/utils/types';
import {
  createAction,
  ActionType,
  isActionOf,
  createAsyncAction,
  isResponseOf,
  asyncActionToPromise,
} from 'raiden-ts/utils/actions';

describe('action factories not tested in reducers.spec.ts', () => {
  const tokenNetwork = '0x0000000000000000000000000000000000020001' as Address,
    partner = '0x0000000000000000000000000000000000000020' as Address;
  test('channelMonitor', () => {
    const id = 12,
      fromBlock = 5123;
    expect(channelMonitored({ id, fromBlock }, { tokenNetwork, partner })).toEqual({
      type: 'channelMonitored',
      payload: { id, fromBlock },
      meta: { tokenNetwork, partner },
    });
  });

  test('channelDeposit', () => {
    const deposit = bigNumberify(999) as UInt<32>;
    expect(channelDeposit({ deposit }, { tokenNetwork, partner })).toEqual({
      type: 'channelDeposit',
      payload: { deposit },
      meta: { tokenNetwork, partner },
    });
  });

  test('channelDepositFailed', () => {
    const error = new Error('not enough funds');
    expect(channelDepositFailed(error, { tokenNetwork, partner })).toEqual({
      type: 'channelDepositFailed',
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
    const actionTPE = createAction('TEST6', t.type({ a: t.number }), undefined, false);
    const actionTPME = createAction(
      'TEST7',
      t.type({ a: t.number }),
      t.type({ m: t.string }),
      true,
    );
    const actionTME = createAction('TEST8', undefined, t.type({ m: t.string }), false);
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
    expect(actionTPE({ a: 1 })).toStrictEqual({ type: 'TEST6', payload: { a: 1 }, error: false });
    expect(actionTPME({ a: 1 }, { m: 'abc' })).toStrictEqual({
      type: 'TEST7',
      payload: { a: 1 },
      meta: { m: 'abc' },
      error: true,
    });
    expect(actionTME(undefined, { m: 'abc' })).toStrictEqual({
      type: 'TEST8',
      meta: { m: 'abc' },
      error: false,
    });

    // test action with payload unioned with undefined
    expect(actionUnd({ a: 1 })).toStrictEqual({ type: 'TEST_U', payload: { a: 1 } });
    expect(actionUnd(undefined)).toStrictEqual({ type: 'TEST_U', payload: undefined });
    expect(actionUnd.is(actionUnd(undefined))).toBe(true);

    try {
      throw new Error('Failed');
    } catch (e) {
      expect(actionFailed(e, { context: 'init' })).toStrictEqual({
        type: 'TEST_FAILED',
        payload: expect.any(Error),
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
      'test/request',
      'test/success',
      'test/failure',
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

    const err = new Error('no entry with given id');
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
    await expect(asyncActionToPromise(asyncAction, req.meta, action$)).rejects.toThrow('no entry');

    action$ = from([asyncAction.success(true, { id: 123 }), fail]);
    await expect(asyncActionToPromise(asyncAction, req.meta, action$)).resolves.toBe(true);
  });
});
