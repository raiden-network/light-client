import {
  amount,
  ensureChannelIsDeposited,
  ensureChannelIsOpen,
  ensurePresence,
  getOrWaitTransfer,
  metadataFromClients,
  secret,
  secrethash,
  token,
  tokenNetwork,
} from './fixtures';
import { makeRaidens } from './mocks';

import { BigNumber } from '@ethersproject/bignumber';
import { Zero } from '@ethersproject/constants';
import { firstValueFrom } from 'rxjs';
import { first } from 'rxjs/operators';

import { raidenConfigUpdate } from '@/actions';
import { Capabilities } from '@/constants';
import { MessageType } from '@/messages/types';
import { transfer, transferSigned } from '@/transfers/actions';
import { Direction } from '@/transfers/state';
import { makePaymentId } from '@/transfers/utils';
import type { Int, UInt } from '@/utils/types';

import { sleep } from '../utils';

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

    const promise = firstValueFrom(target.action$.pipe(first(transfer.success.is)));
    raiden.store.dispatch(
      transfer.request(
        {
          tokenNetwork,
          target: target.address,
          value: amount,
          paymentId: makePaymentId(),
          secret,
          ...metadataFromClients([raiden, partner, target], flat),
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
            metadata: {
              routes: [
                expect.objectContaining({
                  route: [raiden.address, partner.address, target.address],
                }),
              ],
            },
          }),
          fee: Zero as Int<32>,
          partner: raiden.address,
        },
        { secrethash, direction: Direction.RECEIVED },
      ),
    );
    expect(partner.output.find(transfer.request.is)).toEqual(
      transfer.request(
        {
          tokenNetwork,
          target: target.address,
          value: amount.add(flat) as UInt<32>,
          paymentId: transf.payment_identifier,
          expiration: transf.lock.expiration.toNumber(),
          initiator: raiden.address,
          resolved: true,
          fee: flat.mul(-1) as Int<32>,
          metadata: {
            routes: [
              expect.objectContaining({
                route: [raiden.address, partner.address, target.address],
              }),
            ],
          },
          partner: target.address,
          userId: (await firstValueFrom(target.deps.matrix$)).getUserId()!,
        },
        { secrethash, direction: Direction.SENT },
      ),
    );
  });

  test('success with !IMMUTABLE_METADATA partner', async () => {
    expect.assertions(3);
    const flat = BigNumber.from(4) as Int<32>;

    const [raiden, partner, target] = await makeRaidens(3);
    // set !IMMUTABLE_METADATA capability in partner
    partner.store.dispatch(
      raidenConfigUpdate({
        caps: { ...partner.config.caps, [Capabilities.IMMUTABLE_METADATA]: 0 },
      }),
    );
    await ensureChannelIsDeposited([raiden, partner]);
    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target]);

    // enable flat fee in mediator
    partner.store.dispatch(raidenConfigUpdate({ mediationFees: { [token]: { flat } } }));
    await ensurePresence([raiden, target]);

    const promise = firstValueFrom(target.action$.pipe(first(transfer.success.is)));
    raiden.store.dispatch(
      transfer.request(
        {
          tokenNetwork,
          target: target.address,
          value: amount,
          paymentId: makePaymentId(),
          secret,
          ...metadataFromClients([raiden, partner, target], flat),
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
            metadata: {
              routes: [
                expect.objectContaining({
                  route: [partner.address, target.address],
                }),
              ],
            },
          }),
          fee: Zero as Int<32>,
          partner: raiden.address,
        },
        { secrethash, direction: Direction.RECEIVED },
      ),
    );
    expect(partner.output.find(transfer.request.is)).toEqual(
      transfer.request(
        {
          tokenNetwork,
          target: target.address,
          value: amount.add(flat) as UInt<32>,
          paymentId: transf.payment_identifier,
          expiration: transf.lock.expiration.toNumber(),
          initiator: raiden.address,
          resolved: true,
          fee: flat.mul(-1) as Int<32>,
          metadata: {
            routes: [
              expect.objectContaining({
                // partner doesn't clear route because target doesn't require it
                route: [partner.address, target.address],
              }),
            ],
          },
          partner: target.address,
          userId: (await firstValueFrom(target.deps.matrix$)).getUserId()!,
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
          secret,
          ...metadataFromClients([raiden, partner, target], Zero as Int<32>),
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

    const [raiden, partner, target, unknownTarget] = await makeRaidens(4);

    await ensureChannelIsDeposited([raiden, partner]);
    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target]);
    await ensurePresence([raiden, target]);

    raiden.store.dispatch(
      transfer.request(
        {
          tokenNetwork,
          target: unknownTarget.address,
          value: amount,
          paymentId: makePaymentId(),
          secret,
          ...metadataFromClients([raiden, partner, unknownTarget], Zero as Int<32>),
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
            target: unknownTarget.address,
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
