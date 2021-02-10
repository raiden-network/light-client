import {
  amount,
  ensureChannelIsDeposited,
  ensureChannelIsOpen,
  ensurePresence,
  getOrWaitTransfer,
  secret,
  secrethash,
  tokenNetwork,
} from '../fixtures';
import { makeRaidens, sleep } from '../mocks';

import { Zero } from '@ethersproject/constants';
import { first } from 'rxjs/operators';

import { raidenConfigUpdate } from '@/actions';
import { Capabilities } from '@/constants';
import { MessageType } from '@/messages/types';
import { transfer, transferSigned } from '@/transfers/actions';
import { Direction } from '@/transfers/state';
import { makePaymentId } from '@/transfers/utils';
import type { Int } from '@/utils/types';

describe('mediate transfers', () => {
  test('success', async () => {
    expect.assertions(3);

    const [raiden, partner, target] = await makeRaidens(3);
    await ensureChannelIsDeposited([raiden, partner]);
    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target]);
    await ensurePresence([raiden, target]);

    const promise = target.action$.pipe(first(transfer.success.is)).toPromise();
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
          value: amount,
          paymentId: transf.payment_identifier,
          paths: [{ path: [target.address], fee: Zero as Int<32> }],
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
});
