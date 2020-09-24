import {
  makeLog,
  makeRaidens,
  sleep,
  waitBlock,
  providersEmit,
  makeHash,
  makeRaiden,
  flushPromises,
} from '../mocks';
import {
  ensureChannelIsDeposited,
  tokenNetwork,
  secrethash,
  secret,
  getOrWaitTransfer,
  expectChannelsAreInSync,
  ensureTransferPending,
} from '../fixtures';

import { first, pluck } from 'rxjs/operators';
import { bigNumberify } from 'ethers/utils';
import { Zero, One } from 'ethers/constants';

import {
  MessageType,
  LockedTransfer,
  Unlock,
  LockExpired,
  Processed,
  SecretReveal,
  SecretRequest,
} from 'raiden-ts/messages/types';
import { isMessageReceivedOfType } from 'raiden-ts/messages/utils';
import { messageReceived, messageSend } from 'raiden-ts/messages/actions';
import {
  transferSigned,
  transferProcessed,
  transferSecretRequest,
  transferUnlock,
  transferUnlockProcessed,
  transfer,
  transferExpire,
  transferExpireProcessed,
  transferSecret,
  transferSecretRegister,
} from 'raiden-ts/transfers/actions';
import { UInt, Int, Signed, untime } from 'raiden-ts/utils/types';
import { makeSecret, getSecrethash, makePaymentId } from 'raiden-ts/transfers/utils';
import { Direction } from 'raiden-ts/transfers/state';

const direction = Direction.RECEIVED;
const paymentId = makePaymentId();
const value = bigNumberify(10) as UInt<32>;
const fee = bigNumberify(3) as Int<32>;
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

      const blockNumber = raiden.deps.provider.blockNumber;
      partner.store.dispatch(
        transfer.request(
          {
            tokenNetwork,
            target: raiden.address,
            value,
            paths: [{ path: [raiden.address], fee }],
            paymentId,
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
        expiration: expect.toBeWithin(
          blockNumber + raiden.config.revealTimeout + 1,
          Number.POSITIVE_INFINITY,
        ),
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
      (await partner.deps.matrix$.toPromise()).stopClient();

      const sentState = getOrWaitTransfer(partner, sentMeta, true);
      partner.store.dispatch(
        transfer.request(
          {
            tokenNetwork,
            target: raiden.address,
            value,
            paths: [{ path: [raiden.address], fee }],
            paymentId,
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

      (await partner.deps.matrix$.toPromise()).stopClient();

      const sentStatePromise = getOrWaitTransfer(partner, sentMeta, (doc) => !!doc.unlock);
      partner.store.dispatch(transferSecret({ secret }, sentMeta));
      partner.store.dispatch(transferUnlock.request(undefined, sentMeta));
      const sentState = await sentStatePromise;
      const unlock = untime(sentState.unlock!);

      // "wrong" secret/secrethash
      const secret_ = makeSecret();
      const secrethash_ = getSecrethash(secret_);
      const promise = raiden.deps.latest$
        .pipe(pluck('action'), first(transferUnlock.failure.is))
        .toPromise();
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

      (await partner.deps.matrix$.toPromise()).stopClient();

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

      // advance blocks to trigger auto-expiration on partner
      await waitBlock(sentState.expiration + 2 * partner.config.confirmationBlocks + 1);

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

      (await partner.deps.matrix$.toPromise()).stopClient();

      const sentStatePromise = getOrWaitTransfer(partner, sentMeta, (doc) => !!doc.expired);
      await waitBlock(pendingSentState.expiration + 2 * partner.config.confirmationBlocks + 1);
      const sentState = await sentStatePromise;
      const expired = untime(sentState.expired!);

      // "wrong" secret/secrethash
      const secret_ = makeSecret();
      const secrethash_ = getSecrethash(secret_);
      const promise = raiden.deps.latest$
        .pipe(pluck('action'), first(transferExpire.failure.is))
        .toPromise();
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

      (await partner.deps.matrix$.toPromise()).stopClient();

      const sentStatePromise = getOrWaitTransfer(partner, sentMeta, (doc) => !!doc.expired);
      await waitBlock(pendingSentState.expiration + 2 * partner.config.confirmationBlocks + 1);
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
    const pendingSentState = await ensureTransferPending([partner, raiden]);

    const sentState = getOrWaitTransfer(partner, sentMeta, (doc) => !!doc.unlockProcessed);
    const receivedState = getOrWaitTransfer(raiden, receivedMeta, (doc) => !!doc.unlockProcessed);

    const txHash = makeHash();
    await waitBlock(pendingSentState.expiration);
    // although we're already "on" the expiration block, the tx below "shows up" barely inside the
    // expiration timeout, which should make it be accepted and unlocked
    await providersEmit(
      {},
      makeLog({
        blockNumber: pendingSentState.expiration - 1,
        transactionHash: txHash,
        filter: secretRegistryContract.filters.SecretRevealed(secrethash, null),
        data: secret,
      }),
    );
    // confirm secretRegistered after expiration, but register block is before
    await waitBlock(pendingSentState.expiration + raiden.config.confirmationBlocks);

    await expect(sentState).resolves.toMatchObject({
      secret,
      secretRegistered: {
        txHash,
        txBlock: pendingSentState.expiration - 1,
        ts: expect.any(Number),
      },
    });
    await expect(receivedState).resolves.toMatchObject({
      secret,
      secretRegistered: {
        txHash,
        txBlock: pendingSentState.expiration - 1,
        ts: expect.any(Number),
      },
    });
  });

  test('secret auto register', async () => {
    expect.assertions(5);

    const [raiden, partner] = await makeRaidens(2);
    const { secretRegistryContract } = raiden.deps;
    const sentState = await ensureTransferPending([partner, raiden]);
    // stop partner so it can't unlock
    partner.stop();
    // "reveal" secret directly to target
    raiden.store.dispatch(transferSecret({ secret }, receivedMeta));

    const receivedState = getOrWaitTransfer(raiden, receivedMeta, (doc) => !!doc.secretRegistered);

    // advance to some block before start of the danger zone, secret not yet registered
    await waitBlock(sentState.expiration - raiden.config.revealTimeout - 1);
    expect(raiden.output).not.toContainEqual(
      transferSecretRegister.request(expect.anything(), expect.anything()),
    );
    expect(secretRegistryContract.functions.registerSecret).not.toHaveBeenCalled();

    // advance to some block inside the danger zone, secret get registered
    await waitBlock(sentState.expiration - raiden.config.revealTimeout + 1);
    expect(raiden.output).toContainEqual(transferSecretRegister.request({ secret }, receivedMeta));
    expect(secretRegistryContract.functions.registerSecret).toHaveBeenCalledWith(secret);
    // give some time to confirm register tx
    await waitBlock();
    await waitBlock(
      sentState.expiration - raiden.config.revealTimeout + raiden.config.confirmationBlocks + 2,
    );

    await expect(receivedState).resolves.toMatchObject({
      secret,
      secretRegistered: {
        txHash: (await secretRegistryContract.functions.registerSecret.mock.results[0].value).hash,
        txBlock: expect.toBeWithin(
          sentState.expiration - raiden.config.revealTimeout + 1,
          sentState.expiration,
        ),
      },
    });
  });
});

describe('transferRetryMessageEpic', () => {
  test('transferSecretRequest', async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    await ensureChannelIsDeposited([raiden, partner]);
    await ensureTransferPending([partner, raiden]);
    partner.stop();

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
    partner.stop();

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

  raiden.stop();
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
