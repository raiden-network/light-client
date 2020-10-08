import { makeRaidens, sleep } from '../mocks';
import {
  ensureChannelIsDeposited,
  ensureChannelIsOpen,
  secret,
  secrethash,
  amount,
  tokenNetwork,
  getOrWaitTransfer,
  ensurePresence,
} from '../fixtures';

import { Zero } from 'ethers/constants';
import { first } from 'rxjs/operators';

import { Capabilities } from 'raiden-ts/constants';
import { raidenConfigUpdate } from 'raiden-ts/actions';
import { MessageType } from 'raiden-ts/messages/types';
import { transfer, transferSigned } from 'raiden-ts/transfers/actions';
import { Int } from 'raiden-ts/utils/types';
import { makePaymentId } from 'raiden-ts/transfers/utils';
import { Direction } from 'raiden-ts/transfers/state';

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
