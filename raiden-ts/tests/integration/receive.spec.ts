import {
  amount,
  ensureChannelIsDeposited,
  ensureTransferPending,
  expectChannelsAreInSync,
  fee,
  getOrWaitTransfer,
  metadataFromClients,
  secret,
  secrethash,
  tokenNetwork,
} from './fixtures';
import {
  flushPromises,
  makeLog,
  makeRaiden,
  makeRaidens,
  providersEmit,
  sleep,
  waitBlock,
} from './mocks';

import { One, Zero } from '@ethersproject/constants';
import { firstValueFrom } from 'rxjs';
import { first } from 'rxjs/operators';

import { raidenConfigUpdate } from '@/actions';
import { Capabilities } from '@/constants';
import { messageReceived, messageSend } from '@/messages/actions';
import {
  LockedTransfer,
  LockExpired,
  MessageType,
  Processed,
  SecretRequest,
  SecretReveal,
  Unlock,
} from '@/messages/types';
import { isMessageReceivedOfType, signMessage } from '@/messages/utils';
import {
  transfer,
  transferExpire,
  transferExpireProcessed,
  transferProcessed,
  transferSecret,
  transferSecretRegister,
  transferSecretRequest,
  transferSigned,
  transferUnlock,
  transferUnlockProcessed,
} from '@/transfers/actions';
import { Direction } from '@/transfers/state';
import { getSecrethash, makeMessageId, makePaymentId, makeSecret } from '@/transfers/utils';
import type { Int, UInt } from '@/utils/types';
import { Signed, untime } from '@/utils/types';

import { makeHash } from '../utils';

const direction = Direction.RECEIVED;
const paymentId = makePaymentId();
const value = amount;
const receivedMeta = { secrethash, direction };
const sentMeta = { secrethash, direction: Direction.SENT };

describe('receive transfers', () => {
  describe('LockedTransfer', () => {
    test('success and cached', async () => {
      expect.assertions(8);

      const [raiden, partner] = await makeRaidens(2);
      await ensureChannelIsDeposited([partner, raiden]);

      const sentState = getOrWaitTransfer(partner, sentMeta, (doc) => !!doc.transferProcessed);
      const receivedState = getOrWaitTransfer(
        raiden,
        receivedMeta,
        (doc) => !!doc.transferProcessed,
      );

      const xferTs = Math.round(Date.now() / 1e3);
      partner.store.dispatch(
        transfer.request(
          {
            tokenNetwork,
            target: raiden.address,
            value,
            paymentId,
            ...metadataFromClients([partner, raiden]),
          },
          sentMeta,
        ),
      );

      await expect(sentState).resolves.toMatchObject({
        transfer: {
          type: MessageType.LOCKED_TRANSFER,
          lock: {
            secrethash,
            amount: value.add(fee),
          },
        },
        fee,
        partner: raiden.address,
        expiration: xferTs + raiden.config.revealTimeout * raiden.config.expiryFactor,
      });
      const locked = (await sentState).transfer;

      await expect(receivedState).resolves.toMatchObject({
        transfer: {
          type: MessageType.LOCKED_TRANSFER,
          nonce: One,
          locked_amount: value.add(fee),
          transferred_amount: Zero,
          ts: expect.any(Number),
        },
        fee: Zero,
        partner: partner.address,
        expiration: (await sentState).expiration,
        transferProcessed: expect.objectContaining({
          type: MessageType.PROCESSED,
          message_identifier: locked.message_identifier,
        }),
      });

      const received = raiden.output.find(isMessageReceivedOfType(Signed(LockedTransfer)))!;
      expect(received).toBeTruthy();

      // dispatch received message again to retrigger cached Processed
      raiden.store.dispatch(received);
      await sleep();

      expect(raiden.output.filter(transferSigned.is)).toHaveLength(1);
      // multiple processed for same request
      expect(
        raiden.output
          .filter(transferProcessed.is)
          .filter(
            (a) =>
              Processed.is(a.payload.message) &&
              a.payload.message.message_identifier.eq(locked.message_identifier),
          ).length,
      ).toBeGreaterThan(1);

      // secret got requested
      expect(raiden.output).toContainEqual(
        transferSecretRequest(
          {
            message: expect.objectContaining({
              type: MessageType.SECRET_REQUEST,
              secrethash,
            }),
            userId: (await firstValueFrom(partner.deps.matrix$)).getUserId()!,
          },
          receivedMeta,
        ),
      );

      expectChannelsAreInSync([raiden, partner]);
    });

    test('fail: invalid nonce', async () => {
      expect.assertions(2);

      const [raiden, partner] = await makeRaidens(2);
      await ensureChannelIsDeposited([partner, raiden]);

      // stopping mocked MatrixClient prevents messages from being forwarded
      (await firstValueFrom(partner.deps.matrix$)).stopClient();

      const sentState = getOrWaitTransfer(partner, sentMeta, true);
      partner.store.dispatch(
        transfer.request(
          {
            tokenNetwork,
            target: raiden.address,
            value,
            paymentId,
            ...metadataFromClients([partner, raiden]),
          },
          sentMeta,
        ),
      );
      const locked: Signed<LockedTransfer> = untime((await sentState).transfer);

      // "receive" wrong nonce
      raiden.store.dispatch(
        messageReceived(
          {
            text: '',
            ts: Date.now(),
            message: { ...locked, nonce: locked.nonce.add(1) as UInt<8> },
          },
          { address: partner.address },
        ),
      );
      await sleep();
      expect(raiden.output).not.toContainEqual(
        transferSigned(expect.anything(), expect.anything()),
      );
      expect(raiden.output).toContainEqual(
        transfer.failure(
          expect.objectContaining({ message: expect.stringContaining('nonce mismatch') }),
          receivedMeta,
        ),
      );
    });
  });

  describe('Unlock', () => {
    test('success and cached', async () => {
      expect.assertions(6);

      const [raiden, partner] = await makeRaidens(2);
      const sentState = await ensureTransferPending([partner, raiden], value);

      const receivedState = getOrWaitTransfer(
        raiden,
        receivedMeta,
        (doc) => !!doc.unlockProcessed,
      );
      // "reveal" secret directly to target, so it unlocks back to initiator
      raiden.store.dispatch(transferSecret({ secret }, receivedMeta));

      await expect(receivedState).resolves.toMatchObject({
        unlock: {
          type: MessageType.UNLOCK,
          nonce: sentState.transfer.nonce.add(1),
          locked_amount: Zero,
          transferred_amount: value,
        },
      });
      const unlock = (await receivedState).unlock!;

      const received = raiden.output.find(isMessageReceivedOfType(Signed(Unlock)))!;
      expect(received).toBeTruthy();

      // dispatch received message again to retrigger cached Processed
      raiden.store.dispatch(received);
      await sleep();

      expect(raiden.output.filter(transferSigned.is)).toHaveLength(1);
      // multiple processed for same request
      expect(
        raiden.output
          .filter(transferUnlockProcessed.is)
          .filter(
            (a) =>
              Processed.is(a.payload.message) &&
              a.payload.message.message_identifier.eq(unlock.message_identifier),
          ).length,
      ).toBeGreaterThan(1);

      expectChannelsAreInSync([raiden, partner]);
    });

    test('fail: ignore unknown transfer/secrethash', async () => {
      expect.assertions(2);

      const [raiden, partner] = await makeRaidens(2);
      await ensureTransferPending([partner, raiden], value);

      (await firstValueFrom(partner.deps.matrix$)).stopClient();

      const sentStatePromise = getOrWaitTransfer(partner, sentMeta, (doc) => !!doc.unlock);
      partner.store.dispatch(transferSecret({ secret }, sentMeta));
      partner.store.dispatch(transferUnlock.request(undefined, sentMeta));
      const sentState = await sentStatePromise;
      const unlock = untime(sentState.unlock!);

      // "wrong" secret/secrethash
      const secret_ = makeSecret();
      const secrethash_ = getSecrethash(secret_);
      const promise = firstValueFrom(raiden.action$.pipe(first(transferUnlock.failure.is)));
      raiden.store.dispatch(
        messageReceived(
          {
            text: '',
            message: { ...unlock, secret: secret_ },
            ts: Date.now(),
          },
          { address: partner.address },
        ),
      );
      await expect(promise).resolves.toEqual(
        transferUnlock.failure(expect.any(Error), { secrethash: secrethash_, direction }),
      );
      expect(raiden.output).not.toContainEqual(
        transferUnlock.success(expect.anything(), expect.anything()),
      );
    });

    test('fail: wrong nonce', async () => {
      expect.assertions(2);

      const [raiden, partner] = await makeRaidens(2);
      await ensureTransferPending([partner, raiden], value);

      (await firstValueFrom(partner.deps.matrix$)).stopClient();

      const sentStatePromise = getOrWaitTransfer(partner, sentMeta, (doc) => !!doc.unlock);
      partner.store.dispatch(transferSecret({ secret }, sentMeta));
      partner.store.dispatch(transferUnlock.request(undefined, sentMeta));
      const sentState = await sentStatePromise;
      const unlock = untime(sentState.unlock!);

      // "wrong" nonce
      raiden.store.dispatch(
        messageReceived(
          {
            text: '',
            message: { ...unlock, nonce: unlock.nonce.add(1) as UInt<8> },
            ts: Date.now(),
          },
          { address: partner.address },
        ),
      );

      await sleep();
      expect(raiden.output).not.toContainEqual(
        transferUnlock.success(expect.anything(), expect.anything()),
      );
      expect(raiden.output).toContainEqual(
        transferUnlock.failure(
          expect.objectContaining({ message: expect.stringContaining('nonce mismatch') }),
          receivedMeta,
        ),
      );
    });
  });

  describe('LockExpired', () => {
    test('success and cached', async () => {
      expect.assertions(6);

      const [raiden, partner] = await makeRaidens(2);
      const sentState = await ensureTransferPending([partner, raiden], value);

      const receivedState = getOrWaitTransfer(
        raiden,
        receivedMeta,
        (doc) => !!doc.expiredProcessed,
      );

      // advance time to trigger auto-expiration on partner
      await sleep(sentState.expiration * 1e3 - Date.now() + 10e3);

      await expect(receivedState).resolves.toMatchObject({
        expired: {
          type: MessageType.LOCK_EXPIRED,
          nonce: sentState.transfer.nonce.add(1),
          locked_amount: Zero,
          transferred_amount: Zero,
        },
      });
      const expired = (await receivedState).expired!;

      const received = raiden.output.find(isMessageReceivedOfType(Signed(LockExpired)))!;
      expect(received).toBeTruthy();

      // dispatch received message again to retrigger cached Processed
      raiden.store.dispatch(received);
      await sleep();

      expect(raiden.output.filter(transferSigned.is)).toHaveLength(1);
      // multiple processed for same request
      expect(
        raiden.output
          .filter(transferExpireProcessed.is)
          .filter(
            (a) =>
              Processed.is(a.payload.message) &&
              a.payload.message.message_identifier.eq(expired.message_identifier),
          ).length,
      ).toBeGreaterThan(1);

      expectChannelsAreInSync([raiden, partner]);
    });

    test('fail: ignore unknown transfer/secrethash', async () => {
      expect.assertions(2);

      const [raiden, partner] = await makeRaidens(2);
      const pendingSentState = await ensureTransferPending([partner, raiden], value);

      (await firstValueFrom(partner.deps.matrix$)).stopClient();

      const sentStatePromise = getOrWaitTransfer(partner, sentMeta, (doc) => !!doc.expired);
      await sleep(pendingSentState.expiration * 1e3 - Date.now() + 10e3);
      const sentState = await sentStatePromise;
      const expired = untime(sentState.expired!);

      // "wrong" secret/secrethash
      const secret_ = makeSecret();
      const secrethash_ = getSecrethash(secret_);
      const promise = firstValueFrom(raiden.action$.pipe(first(transferExpire.failure.is)));
      raiden.store.dispatch(
        messageReceived(
          {
            text: '',
            message: { ...expired, secrethash: secrethash_ },
            ts: Date.now(),
          },
          { address: partner.address },
        ),
      );

      await expect(promise).resolves.toEqual(
        transferExpire.failure(expect.any(Error), { secrethash: secrethash_, direction }),
      );
      expect(raiden.output).not.toContainEqual(
        transferExpire.success(expect.anything(), expect.anything()),
      );
    });

    test('fail: wrong nonce', async () => {
      expect.assertions(2);

      const [raiden, partner] = await makeRaidens(2);
      const pendingSentState = await ensureTransferPending([partner, raiden], value);

      (await firstValueFrom(partner.deps.matrix$)).stopClient();

      const sentStatePromise = getOrWaitTransfer(partner, sentMeta, (doc) => !!doc.expired);
      await sleep(pendingSentState.expiration * 1e3 - Date.now() + 10e3);
      const sentState = await sentStatePromise;
      const expired = untime(sentState.expired!);

      // "wrong" nonce
      raiden.store.dispatch(
        messageReceived(
          {
            text: '',
            message: { ...expired, nonce: expired.nonce.add(1) as UInt<8> },
            ts: Date.now(),
          },
          { address: partner.address },
        ),
      );

      await sleep();
      expect(raiden.output).not.toContainEqual(
        transferExpire.success(expect.anything(), expect.anything()),
      );
      expect(raiden.output).toContainEqual(
        transferExpire.failure(
          expect.objectContaining({ message: expect.stringContaining('nonce mismatch') }),
          receivedMeta,
        ),
      );
    });
  });

  test('secret revealed on-chain for received transfer', async () => {
    expect.assertions(2);

    const [raiden, partner] = await makeRaidens(2);
    const { secretRegistryContract } = raiden.deps;
    await ensureTransferPending([partner, raiden]);

    const sentState = getOrWaitTransfer(partner, sentMeta, (doc) => !!doc.unlockProcessed);
    const receivedState = getOrWaitTransfer(raiden, receivedMeta, (doc) => !!doc.unlockProcessed);

    const txHash = makeHash();
    const txBlock = raiden.deps.provider.blockNumber;
    await providersEmit(
      {},
      makeLog({
        blockNumber: txBlock,
        transactionHash: txHash,
        filter: secretRegistryContract.filters.SecretRevealed(secrethash),
        data: secret,
      }),
    );
    // confirm secretRegistered after expiration, but register block is before
    await waitBlock(txBlock + raiden.config.confirmationBlocks + 1, false);
    await sleep();

    await expect(sentState).resolves.toMatchObject({
      secret,
      secretRegistered: {
        txHash,
        txBlock,
        ts: expect.any(Number),
      },
    });
    await expect(receivedState).resolves.toMatchObject({
      secret,
      secretRegistered: {
        txHash,
        txBlock,
        ts: expect.any(Number),
      },
    });
  }, 10e3);

  test('secret auto register', async () => {
    expect.assertions(5);

    const [raiden, partner] = await makeRaidens(2);
    const { secretRegistryContract } = raiden.deps;
    const sentState = await ensureTransferPending([partner, raiden]);
    // stop partner so it can't unlock
    await partner.stop();
    // "reveal" secret directly to target
    raiden.store.dispatch(transferSecret({ secret }, receivedMeta));

    const receivedState = getOrWaitTransfer(raiden, receivedMeta, (doc) => !!doc.secretRegistered);

    // advance to some time before start of the danger zone, secret not yet registered
    await sleep((sentState.expiration - raiden.config.revealTimeout - 1) * 1e3 - Date.now());
    expect(raiden.output).not.toContainEqual(
      transferSecretRegister.request(expect.anything(), expect.anything()),
    );
    expect(secretRegistryContract.registerSecret).not.toHaveBeenCalled();

    // advance to some time inside the danger zone, secret gets registered
    await sleep(2e3);
    expect(raiden.output).toContainEqual(transferSecretRegister.request({ secret }, receivedMeta));
    expect(secretRegistryContract.registerSecret).toHaveBeenCalledWith(secret, expect.anything());
    await waitBlock(
      raiden.deps.provider.blockNumber + raiden.config.confirmationBlocks + 1,
      false,
    );
    await sleep();

    await expect(receivedState).resolves.toMatchObject({
      secret,
      secretRegistered: {
        txHash: (await secretRegistryContract.registerSecret.mock.results[0].value).hash,
        ts: expect.toBeWithin(
          (sentState.expiration - raiden.config.revealTimeout) * 1e3,
          sentState.expiration * 1e3,
        ),
      },
    });
  });

  test('reveal ignored if receiving disabled', async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    await ensureTransferPending([partner, raiden]);

    // disable receiving for us
    raiden.store.dispatch(raidenConfigUpdate({ caps: { [Capabilities.RECEIVE]: 0 } }));
    await sleep();

    // try to reveal secret directly to target
    raiden.store.dispatch(
      messageReceived(
        {
          text: '',
          ts: 123,
          message: await signMessage(partner.deps.signer, {
            type: MessageType.SECRET_REVEAL,
            message_identifier: makeMessageId(),
            secret,
          }),
          userId: partner.store.getState().transport.setup!.userId,
        },
        { address: partner.address },
      ),
    );

    // give some time to confirm register tx
    await sleep(raiden.config.httpTimeout);

    expect(raiden.output).not.toContainEqual(transferSecret(expect.anything(), expect.anything()));
  });
});

describe('transferRetryMessageEpic', () => {
  test('transferSecretRequest', async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    await ensureChannelIsDeposited([raiden, partner]);
    await ensureTransferPending([partner, raiden]);
    await partner.stop();

    await sleep(raiden.config.httpTimeout);
    expect(
      raiden.output
        .filter(messageSend.request.is)
        .filter((r) => SecretRequest.is(r.payload.message)).length,
    ).toBeGreaterThan(1);
  });

  test('transferSecretReveal', async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    await ensureChannelIsDeposited([raiden, partner]);
    await ensureTransferPending([partner, raiden]);
    await partner.stop();

    // once we know the secret for the received transfer, we start to reveal back to unlock
    raiden.store.dispatch(
      transferSecret({ secret }, { secrethash, direction: Direction.RECEIVED }),
    );
    await sleep(raiden.config.httpTimeout);

    expect(
      raiden.output
        .filter(messageSend.request.is)
        .filter((r) => SecretReveal.is(r.payload.message)).length,
    ).toBeGreaterThan(1);
  });
});

test('initQueuePendingReceivedEpic', async () => {
  expect.assertions(2);

  let raiden = await makeRaiden();
  const partner = await makeRaiden();
  await ensureChannelIsDeposited([raiden, partner]);
  const sentState = await ensureTransferPending([partner, raiden]);

  await raiden.stop();
  await flushPromises();
  await sleep(raiden.config.httpTimeout);
  // re-init client: requires memory pouchDB to persist across instances on same wallet (dbName)
  raiden = await makeRaiden(raiden.deps.signer);

  expect(raiden.output).toContainEqual(
    transferSigned(
      { message: untime(sentState.transfer), fee: Zero as Int<32>, partner: partner.address },
      receivedMeta,
    ),
  );
  expect(raiden.output).toContainEqual(
    transferSecretRequest(
      {
        message: expect.objectContaining({
          type: MessageType.SECRET_REQUEST,
          secrethash,
        }),
      },
      receivedMeta,
    ),
  );
});
