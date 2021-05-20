/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  amount,
  ensureChannelIsDeposited,
  ensureChannelIsOpen,
  ensurePresence,
  getOrWaitTransfer,
  secret,
  secrethash,
  token,
  tokenNetwork,
} from '../fixtures';
import { makeRaidens } from '../mocks';

import { BigNumber } from '@ethersproject/bignumber';
import { AddressZero, MaxUint256, Zero } from '@ethersproject/constants';
import { first } from 'rxjs/operators';

import { raidenConfigUpdate } from '@/actions';
import { Capabilities } from '@/constants';
import { MessageType } from '@/messages/types';
import { transfer, transferSigned } from '@/transfers/actions';
import type { FeeModel } from '@/transfers/mediate/types';
import { getStandardFeeCalculator } from '@/transfers/mediate/types';
import { Direction } from '@/transfers/state';
import { makePaymentId } from '@/transfers/utils';
import { assert } from '@/utils';
import { decode, Int, UInt } from '@/utils/types';

import { makeAddress, sleep } from '../../utils';

describe('mediate transfers', () => {
  test('success with flat fees', async () => {
    expect.assertions(3);
    const flat = BigNumber.from(4) as Int<32>;

    const [raiden, partner, target] = await makeRaidens(3);
    await ensureChannelIsDeposited([raiden, partner]);
    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target]);

    // enable flat fee in mediator
    partner.store.dispatch(raidenConfigUpdate({ mediationFees: { [token]: { flat } } }));
    await ensurePresence([raiden, target]);

    const promise = target.action$.pipe(first(transfer.success.is)).toPromise();
    raiden.store.dispatch(
      transfer.request(
        {
          tokenNetwork,
          target: target.address,
          value: amount,
          paymentId: makePaymentId(),
          paths: [{ path: [partner.address, target.address], fee: flat }],
          secret,
        },
        { secrethash, direction: Direction.SENT },
      ),
    );
    await expect(promise).resolves.toEqual(
      transfer.success(expect.anything(), { secrethash, direction: Direction.RECEIVED }),
    );
    const transf = (await getOrWaitTransfer(raiden, { secrethash, direction: Direction.SENT }))
      .transfer;

    expect(partner.output).toContainEqual(
      transferSigned(
        {
          message: expect.objectContaining({
            type: MessageType.LOCKED_TRANSFER,
            initiator: raiden.address,
            target: target.address,
            payment_identifier: transf.payment_identifier,
          }),
          fee: Zero as Int<32>,
          partner: raiden.address,
        },
        { secrethash, direction: Direction.RECEIVED },
      ),
    );
    expect(partner.output).toContainEqual(
      transfer.request(
        {
          tokenNetwork,
          target: target.address,
          value: amount.add(flat) as UInt<32>,
          paymentId: transf.payment_identifier,
          paths: [{ path: [target.address], fee: flat.mul(-1) as Int<32> }],
          expiration: transf.lock.expiration.toNumber(),
          initiator: raiden.address,
        },
        { secrethash, direction: Direction.SENT },
      ),
    );
  });

  test('skip if !MEDIATE', async () => {
    expect.assertions(3);

    const [raiden, partner, target] = await makeRaidens(3);
    partner.store.dispatch(
      raidenConfigUpdate({
        caps: {
          [Capabilities.DELIVERY]: 0,
          [Capabilities.MEDIATE]: 0,
        },
      }),
    );
    await ensureChannelIsDeposited([raiden, partner]);
    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target]);
    await ensurePresence([raiden, target]);

    raiden.store.dispatch(
      transfer.request(
        {
          tokenNetwork,
          target: target.address,
          value: amount,
          paymentId: makePaymentId(),
          paths: [{ path: [partner.address, target.address], fee: Zero as Int<32> }],
          secret,
        },
        { secrethash, direction: Direction.SENT },
      ),
    );
    await sleep(raiden.config.httpTimeout);
    expect(target.output).not.toContainEqual(
      transferSigned(expect.anything(), { secrethash, direction: Direction.RECEIVED }),
    );
    // mediated transfer received
    expect(partner.output).toContainEqual(
      transferSigned(
        {
          message: expect.objectContaining({
            type: MessageType.LOCKED_TRANSFER,
            initiator: raiden.address,
            target: target.address,
          }),
          fee: Zero as Int<32>,
          partner: raiden.address,
        },
        { secrethash, direction: Direction.RECEIVED },
      ),
    );
    // but not forwarded
    expect(partner.output).not.toContainEqual(
      transfer.request(expect.anything(), { secrethash, direction: Direction.SENT }),
    );
  });

  test('skip if no suitable route', async () => {
    expect.assertions(3);

    const [raiden, partner, target] = await makeRaidens(3);
    const unknownTarget = makeAddress();

    await ensureChannelIsDeposited([raiden, partner]);
    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target]);
    await ensurePresence([raiden, target]);

    raiden.store.dispatch(
      transfer.request(
        {
          tokenNetwork,
          target: unknownTarget,
          value: amount,
          paymentId: makePaymentId(),
          paths: [{ path: [partner.address, unknownTarget], fee: Zero as Int<32> }],
          secret,
        },
        { secrethash, direction: Direction.SENT },
      ),
    );
    await sleep(raiden.config.httpTimeout);
    expect(target.output).not.toContainEqual(
      transferSigned(expect.anything(), { secrethash, direction: Direction.RECEIVED }),
    );
    // mediated transfer received
    expect(partner.output).toContainEqual(
      transferSigned(
        {
          message: expect.objectContaining({
            type: MessageType.LOCKED_TRANSFER,
            initiator: raiden.address,
            target: unknownTarget,
          }),
          fee: Zero as Int<32>,
          partner: raiden.address,
        },
        { secrethash, direction: Direction.RECEIVED },
      ),
    );
    // but not forwarded
    expect(partner.output).not.toContainEqual(
      transfer.request(expect.anything(), { secrethash, direction: Direction.SENT }),
    );
  });
});

describe('getStandardFeeCalculator', () => {
  const token = makeAddress();
  const unknownToken = makeAddress();
  // a simple toy feeModel
  const keyModel: FeeModel<number, { key: string }> = {
    name: 'key',
    emptySchedule: { key: '0' },
    decodeConfig(config) {
      assert(typeof config === 'number');
      return config + 1;
    },
    fee(config) {
      return (amountIn) => decode(Int(32), amountIn.sub(config));
    },
    schedule(config) {
      return { key: config.toString() };
    },
  };
  const calculator = getStandardFeeCalculator({ key: keyModel });

  test('decodeConfig', () => {
    // per-token configs are optional
    expect(calculator.decodeConfig({ [token]: {} })).toBeDefined();
    // matching isn't exact, unknown properties are accepted
    expect(calculator.decodeConfig({ [token]: { custom: 123 } })).toBeDefined();
    // returned config is decoded by sub-model
    expect(calculator.decodeConfig({ [token]: { key: 100 } })).toEqual({
      [token]: { key: 101 },
    });
    // if it can't decode, it should throw
    expect(() => calculator.decodeConfig({ [token]: { key: true } })).toThrow();
  });

  test('fee', () => {
    const anotherToken = makeAddress();
    const config = calculator.decodeConfig({
      [token]: { key: 99 },
      [anotherToken]: { custom: true },
      [AddressZero]: { key: 999 },
    });
    // we avoid creating a whole channel state, just for testing purposes
    const tokenChannel = { token } as any;

    expect(calculator.fee(config, tokenChannel, tokenChannel)(decode(UInt(32), 1337))).toEqual(
      BigNumber.from(1337 - 100),
    );
    // resulting fee out of range
    expect(() =>
      calculator.fee(
        config,
        tokenChannel,
        tokenChannel,
      )(decode(UInt(32), MaxUint256.mul(-1).add(50))),
    ).toThrow();

    // unknown token should fall back to [AddressZero] config
    const unknownChannel = { token: unknownToken } as any;
    expect(calculator.fee(config, unknownChannel, unknownChannel)(decode(UInt(32), 3000))).toEqual(
      BigNumber.from(3000 - 1000),
    );

    // known token but unknown config should *not* pick the fallback, since there's a config
    const anotherChannel = { token: anotherToken } as any;
    expect(calculator.fee(config, anotherChannel, anotherChannel)(decode(UInt(32), 3000))).toEqual(
      Zero,
    );
  });

  test('schedule', () => {
    const config = calculator.decodeConfig({ [token]: { key: 99 }, [AddressZero]: { key: 999 } });
    // we avoid creating a whole channel state, just for testing purposes
    const tokenChannel = { token } as any;

    expect(calculator.schedule(config, tokenChannel)).toEqual({ key: '100' });

    // unknown token should fall back to [AddressZero] config
    const unknownChannel = { token: unknownToken } as any;
    expect(calculator.schedule(config, unknownChannel)).toEqual({ key: '1000' });
  });
});
