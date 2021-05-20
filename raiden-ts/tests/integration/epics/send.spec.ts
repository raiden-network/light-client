import {
  ensureChannelIsDeposited,
  ensureTransferPending,
  ensureTransferUnlocked,
  expectChannelsAreInSync,
  getChannel,
  getOrWaitTransfer,
  secret,
  secrethash,
  tokenNetwork,
} from '../fixtures';
import { makeLog, makeRaiden, makeRaidens, providersEmit, waitBlock } from '../mocks';

import { BigNumber } from '@ethersproject/bignumber';
import { Two, Zero } from '@ethersproject/constants';
import { keccak256 } from '@ethersproject/keccak256';
import { first, pluck } from 'rxjs/operators';

import { raidenConfigUpdate } from '@/actions';
import { channelClose, newBlock } from '@/channels/actions';
import { channelUniqueKey } from '@/channels/utils';
import { Capabilities } from '@/constants';
import { messageReceived, messageSend } from '@/messages/actions';
import type { Processed } from '@/messages/types';
import { LockedTransfer, LockExpired, MessageType, Unlock } from '@/messages/types';
import { signMessage } from '@/messages/utils';
import {
  transfer,
  transferExpire,
  transferSecret,
  transferSecretRegister,
  transferSigned,
  transferUnlock,
} from '@/transfers/actions';
import { Direction } from '@/transfers/state';
import { getSecrethash, makePaymentId, makeSecret, transferKey } from '@/transfers/utils';
import { isResponseOf } from '@/utils/actions';
import type { Int, UInt } from '@/utils/types';

import { makeHash, sleep } from '../../utils';
import type { MockedRaiden } from '../mocks';

const direction = Direction.SENT;
const paymentId = makePaymentId();
const value = BigNumber.from(10) as UInt<32>;
const fee = BigNumber.from(3) as Int<32>;
const maxUInt256 = Two.pow(256).sub(1) as UInt<32>;
const meta = { secrethash, direction };

describe('send transfer', () => {
  test('transferSigned success and cached', async () => {
    expect.assertions(6);

    const [raiden, partner] = await makeRaidens(2);
    await ensureChannelIsDeposited([raiden, partner]);

    const requestBlock = raiden.deps.provider.blockNumber;
    const request = transfer.request(
      {
        tokenNetwork,
        target: partner.address,
        value,
        paths: [{ path: [partner.address], fee }],
        paymentId,
        secret,
      },
      meta,
    );
    raiden.store.dispatch(request);
    await waitBlock();

    raiden.store.dispatch(request);
    await waitBlock();

    const expectedLockedTransfer = expect.objectContaining({
      type: MessageType.LOCKED_TRANSFER,
      payment_identifier: paymentId,
      lock: {
        secrethash,
        amount: value.add(fee),
        expiration: BigNumber.from(Math.round(1.1 * raiden.config.revealTimeout)).add(
          requestBlock,
        ),
      },
      signature: expect.any(String),
    });
    expect(raiden.output).toContainEqual(
      transferSigned(
        {
          message: expectedLockedTransfer,
          fee,
          partner: partner.address,
        },
        meta,
      ),
    );
    // despite 2 requests, only one output
    expect(raiden.output.filter(transferSigned.is)).toHaveLength(1);

    expect(raiden.output).toContainEqual(transferSecret({ secret }, meta));
    await expect(getOrWaitTransfer(raiden, transferKey(meta))).resolves.toMatchObject({
      transfer: expectedLockedTransfer,
      fee,
      partner: partner.address,
      direction,
      channel: channelUniqueKey(getChannel(raiden, partner)),
      secrethash,
    });
    await sleep(100);

    expectChannelsAreInSync([raiden, partner]);
  });

  test('overflow in transfer value is handled', async () => {
    const [raiden, partner] = await makeRaidens(2);
    await ensureChannelIsDeposited([raiden, partner]);

    const request = transfer.request(
      {
        tokenNetwork,
        target: partner.address,
        value: maxUInt256,
        paths: [{ path: [partner.address], fee }],
        paymentId,
        secret,
      },
      meta,
    );
    raiden.store.dispatch(request);
    await waitBlock();

    expect(raiden.output).toContainEqual(
      transfer.failure(
        expect.objectContaining({
          message: expect.stringContaining('overflow'),
        }),
        meta,
      ),
    );
  });

  test('transferSigned fail no channel with route partner', async () => {
    expect.assertions(2);

    const [raiden, partner] = await makeRaidens(2);
    // no channel open with partner

    raiden.store.dispatch(
      transfer.request(
        {
          tokenNetwork,
          target: partner.address,
          value,
          paths: [{ path: [partner.address], fee }],
          paymentId,
          secret,
        },
        meta,
      ),
    );
    await sleep(raiden.config.httpTimeout);

    expect(raiden.output).not.toContainEqual(transferSigned(expect.anything(), expect.anything()));
    expect(raiden.output).toContainEqual(
      transfer.failure(
        expect.objectContaining({ message: expect.stringContaining('channel not open') }),
        meta,
      ),
    );
  });

  describe('transferUnlock.request', () => {
    test('success and cached, after expiration with registered secret', async () => {
      expect.assertions(7);

      const [raiden, partner] = await makeRaidens(2);
      const { secretRegistryContract } = raiden.deps;
      const sentState = await ensureTransferPending([raiden, partner]);

      await waitBlock(sentState.expiration - 1);

      const unlock = raiden.deps.latest$
        .pipe(pluck('action'), first(transferUnlock.success.is), pluck('payload', 'message'))
        .toPromise();
      await providersEmit(
        {},
        makeLog({
          blockNumber: sentState.expiration - 1,
          filter: secretRegistryContract.filters.SecretRevealed(secrethash, null),
          data: secret,
        }),
      );
      // confirm secretRegistered
      await waitBlock(sentState.expiration + raiden.config.confirmationBlocks);

      const expectedUnlock = expect.objectContaining({
        type: MessageType.UNLOCK,
        locksroot: keccak256([]),
        transferred_amount: sentState.transfer.lock.amount,
        locked_amount: Zero,
        secret,
        message_identifier: expect.any(BigNumber),
        signature: expect.any(String),
      });
      await expect(unlock).resolves.toEqual(expectedUnlock);
      expect(raiden.output).toContainEqual(
        transferUnlock.success(
          {
            message: expectedUnlock,
            partner: partner.address,
          },
          meta,
        ),
      );

      const finalState = await getOrWaitTransfer(raiden, meta, (doc) => !!doc.unlockProcessed);
      expect(finalState).toMatchObject({
        unlock: expectedUnlock,
        unlockProcessed: expect.anything(),
      });

      const promise = raiden.deps.latest$
        .pipe(pluck('action'), first(transferUnlock.success.is))
        .toPromise();
      raiden.store.dispatch(transferUnlock.request(undefined, meta));
      await expect(promise).resolves.toEqual(
        transferUnlock.success(
          {
            message: expectedUnlock,
            partner: partner.address,
          },
          meta,
        ),
      );
      // ensure it reused the previous cached expired message
      expect((await promise).payload.message).toBe(finalState.unlock);

      expectChannelsAreInSync([raiden, partner]);
    });

    test('regression test: sender unlocks even if receiving is disabled', async () => {
      expect.assertions(3);

      const [raiden, partner] = await makeRaidens(2);
      // disable receiving for sender
      raiden.store.dispatch(
        raidenConfigUpdate({ caps: { ...raiden.config.caps, [Capabilities.RECEIVE]: 0 } }),
      );
      await ensureTransferPending([raiden, partner]);
      await sleep();

      // reveal secret to partner
      partner.store.dispatch(
        transferSecret({ secret }, { secrethash, direction: Direction.RECEIVED }),
      );

      await expect(
        raiden.action$.pipe(first(transferUnlock.success.is)).toPromise(),
      ).resolves.toBeDefined();
      await sleep();

      expectChannelsAreInSync([raiden, partner]);
    });

    test('fail: channel closed', async () => {
      expect.assertions(4);

      const [raiden, partner] = await makeRaidens(2);
      await ensureTransferPending([raiden, partner]);

      const promise = raiden.deps.latest$
        .pipe(pluck('action'), first(isResponseOf(transferUnlock, meta)))
        .toPromise();
      partner.store.dispatch(
        transferSecret({ secret }, { secrethash, direction: Direction.RECEIVED }),
      );
      raiden.store.dispatch(
        channelClose.request(undefined, { tokenNetwork, partner: partner.address }),
      );
      await promise;

      expect(raiden.output).not.toContainEqual(
        transferUnlock.success(expect.anything(), expect.anything()),
      );
      expect(raiden.output).toContainEqual(
        transferUnlock.failure(
          expect.objectContaining({ message: expect.stringContaining('channel not open') }),
          meta,
        ),
      );

      expectChannelsAreInSync([raiden, partner]);
    });

    test('fail: lock expired', async () => {
      expect.assertions(4);

      const [raiden, partner] = await makeRaidens(2);
      const sentState = await ensureTransferPending([raiden, partner]);

      await waitBlock(sentState.expiration - 1);
      const promise = raiden.deps.latest$
        .pipe(pluck('action'), first(isResponseOf(transferUnlock, meta)))
        .toPromise();
      // we see expiration block before partner, so we don't unlock
      raiden.store.dispatch(newBlock({ blockNumber: sentState.expiration }));
      partner.store.dispatch(
        transferSecret({ secret }, { secrethash, direction: Direction.RECEIVED }),
      );
      partner.store.dispatch(newBlock({ blockNumber: sentState.expiration }));
      await promise;

      expect(raiden.output).not.toContainEqual(
        transferUnlock.success(expect.anything(), expect.anything()),
      );
      expect(raiden.output).toContainEqual(
        transferUnlock.failure(
          expect.objectContaining({ message: expect.stringContaining('lock expired') }),
          meta,
        ),
      );

      expectChannelsAreInSync([raiden, partner]);
    });
  });

  describe('transferExpire.request', () => {
    test('success and cached', async () => {
      expect.assertions(6);

      const [raiden, partner] = await makeRaidens(2);
      const sentState = await ensureTransferPending([raiden, partner]);

      await waitBlock(sentState.expiration + 2 * raiden.config.confirmationBlocks + 1);

      const expectedExpired = expect.objectContaining({
        type: MessageType.LOCK_EXPIRED,
        locksroot: keccak256([]),
        transferred_amount: Zero,
        locked_amount: Zero,
        message_identifier: expect.any(BigNumber),
        signature: expect.any(String),
      });
      expect(raiden.output).toContainEqual(
        transferExpire.success(
          {
            message: expectedExpired,
            partner: partner.address,
          },
          meta,
        ),
      );

      const finalState = await getOrWaitTransfer(raiden, meta, (doc) => !!doc.expiredProcessed);
      expect(finalState).toMatchObject(
        expect.objectContaining({
          expired: expectedExpired,
          expiredProcessed: expect.anything(),
        }),
      );

      const promise = raiden.deps.latest$
        .pipe(pluck('action'), first(transferExpire.success.is))
        .toPromise();
      raiden.store.dispatch(transferExpire.request(undefined, meta));
      await expect(promise).resolves.toEqual(
        transferExpire.success(
          {
            message: expectedExpired,
            partner: partner.address,
          },
          meta,
        ),
      );
      // ensure it reused the previous cached expired message
      expect((await promise).payload.message).toEqual(finalState.expired);

      expectChannelsAreInSync([raiden, partner]);
    });

    test('fail: channel closed', async () => {
      expect.assertions(4);

      const [raiden, partner] = await makeRaidens(2);
      await ensureTransferPending([raiden, partner]);

      const promise = raiden.deps.latest$
        .pipe(pluck('action'), first(isResponseOf(transferExpire, meta)))
        .toPromise();
      raiden.store.dispatch(
        channelClose.request(undefined, { tokenNetwork, partner: partner.address }),
      );
      raiden.store.dispatch(transferExpire.request(undefined, meta));
      await promise;

      expect(raiden.output).not.toContainEqual(
        transferExpire.success(expect.anything(), expect.anything()),
      );
      expect(raiden.output).toContainEqual(
        transferExpire.failure(
          expect.objectContaining({ message: expect.stringContaining('channel not open') }),
          meta,
        ),
      );

      expectChannelsAreInSync([raiden, partner]);
    });

    test('fail: lock not expired yet', async () => {
      expect.assertions(4);

      const [raiden, partner] = await makeRaidens(2);
      const sentState = await ensureTransferPending([raiden, partner]);

      await waitBlock(sentState.expiration - 1);
      const promise = raiden.deps.latest$
        .pipe(pluck('action'), first(isResponseOf(transferExpire, meta)))
        .toPromise();

      raiden.store.dispatch(transferExpire.request(undefined, meta));
      await promise;

      expect(raiden.output).not.toContainEqual(
        transferExpire.success(expect.anything(), expect.anything()),
      );
      expect(raiden.output).toContainEqual(
        transferExpire.failure(
          expect.objectContaining({ message: expect.stringContaining('lock not yet expired') }),
          meta,
        ),
      );

      expectChannelsAreInSync([raiden, partner]);
    });

    test('fail: transfer unlocked', async () => {
      expect.assertions(3);

      const [raiden, partner] = await makeRaidens(2);
      const sentState = await ensureTransferUnlocked([raiden, partner]);

      await waitBlock(sentState.expiration + 1);
      const promise = raiden.deps.latest$
        .pipe(pluck('action'), first(isResponseOf(transferExpire, meta)))
        .toPromise();

      raiden.store.dispatch(transferExpire.request(undefined, meta));
      await expect(promise).resolves.toEqual(
        transferExpire.failure(
          expect.objectContaining({ message: expect.stringContaining('already unlocked') }),
          meta,
        ),
      );

      expectChannelsAreInSync([raiden, partner]);
    });
  });
});

describe('transferRetryMessageEpic', () => {
  async function pendingTransfer([raiden, partner]: [MockedRaiden, MockedRaiden]) {
    const signedPromise = getOrWaitTransfer(raiden, meta, true);
    raiden.store.dispatch(
      transfer.request(
        {
          tokenNetwork,
          target: partner.address,
          value,
          paths: [{ path: [partner.address], fee: Zero as Int<32> }],
          paymentId,
        },
        meta,
      ),
    );
    return signedPromise;
  }

  test('transferSigned & stop retry', async () => {
    expect.assertions(2);

    const [raiden, partner] = await makeRaidens(2);
    await ensureChannelIsDeposited([raiden, partner]);
    partner.stop();

    const sentState = await pendingTransfer([raiden, partner]);

    await sleep(raiden.config.httpTimeout);
    const sentCount = raiden.output
      .filter(messageSend.request.is)
      .filter((r) => LockedTransfer.is(r.payload.message)).length;
    expect(sentCount).toBeGreaterThan(1);

    const processed = await signMessage<Processed>(partner.deps.signer, {
      type: MessageType.PROCESSED,
      message_identifier: sentState.transfer.message_identifier,
    });
    raiden.store.dispatch(
      messageReceived(
        { text: '', ts: Date.now(), message: processed },
        { address: partner.address },
      ),
    );

    await sleep(raiden.config.httpTimeout);
    // after a long time, no new messages were sent, i.e. retry cleared
    expect(
      raiden.output
        .filter(messageSend.request.is)
        .filter((r) => LockedTransfer.is(r.payload.message)).length,
    ).toBe(sentCount);
  });

  test('transferUnlock', async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    await ensureChannelIsDeposited([raiden, partner]);
    partner.stop();
    await pendingTransfer([raiden, partner]);

    raiden.store.dispatch(transferSecret({ secret }, meta));
    raiden.store.dispatch(transferUnlock.request(undefined, meta));

    await sleep(raiden.config.httpTimeout);
    expect(
      raiden.output.filter(messageSend.request.is).filter((r) => Unlock.is(r.payload.message))
        .length,
    ).toBeGreaterThan(1);
  });

  test('transferExpire', async () => {
    expect.assertions(2);

    const [raiden, partner] = await makeRaidens(2);
    await ensureChannelIsDeposited([raiden, partner]);
    partner.stop();

    const sentState = await pendingTransfer([raiden, partner]);

    // expiration confirmed, enough blocks after
    await waitBlock(sentState.expiration + 2 * raiden.config.confirmationBlocks + 1);
    expect(raiden.output).toContainEqual(transferExpire.request(undefined, meta));

    await sleep(raiden.config.httpTimeout);
    expect(
      raiden.output.filter(messageSend.request.is).filter((r) => LockExpired.is(r.payload.message))
        .length,
    ).toBeGreaterThan(1);
  });
});

describe('transferAutoExpireEpic', () => {
  test('success!', async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    const sentState = await ensureTransferPending([raiden, partner]);

    // expiration confirmed, enough blocks after
    await waitBlock(sentState.expiration + 2 * raiden.config.confirmationBlocks + 1);
    expect(raiden.output).toContainEqual(transferExpire.request(undefined, meta));
  });

  test("don't emit if transfer didn't expire", async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    const sentState = await ensureTransferPending([raiden, partner]);
    // not yet expired
    await waitBlock(sentState.expiration - 1);
    expect(raiden.output).not.toContainEqual(
      transferExpire.request(expect.anything(), expect.anything()),
    );
  });

  test("don't emit if expired but not confirmed yet", async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    const sentState = await ensureTransferPending([raiden, partner]);
    // not yet confirmed
    await waitBlock(sentState.expiration + raiden.config.confirmationBlocks - 1);
    expect(raiden.output).not.toContainEqual(
      transferExpire.request(expect.anything(), expect.anything()),
    );
  });

  test("don't expire if secret registered before expiration", async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    const { secretRegistryContract } = raiden.deps;
    const sentState = await ensureTransferPending([raiden, partner]);
    partner.stop();

    await waitBlock(sentState.expiration - 1);
    await providersEmit(
      {},
      makeLog({
        blockNumber: sentState.expiration - 1,
        filter: secretRegistryContract.filters.SecretRevealed(secrethash, null),
        data: secret,
      }),
    );
    // confirm secretRegistered
    await waitBlock(sentState.expiration + raiden.config.confirmationBlocks);
    // enough confirmation blocks for expiration
    await waitBlock(sentState.expiration + 2 * raiden.config.confirmationBlocks + 1);

    expect(raiden.output).not.toContainEqual(
      transferExpire.request(expect.anything(), expect.anything()),
    );
  });

  test('success: if secret registered after expiration', async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    const { secretRegistryContract } = raiden.deps;
    const sentState = await ensureTransferPending([raiden, partner]);
    partner.stop();

    await waitBlock(sentState.expiration);
    // register secret mined after (at) expiration
    await providersEmit(
      {},
      makeLog({
        blockNumber: sentState.expiration,
        filter: secretRegistryContract.filters.SecretRevealed(secrethash, null),
        data: secret,
      }),
    );
    // confirm secretRegistered
    await waitBlock(sentState.expiration + raiden.config.confirmationBlocks + 1);
    // enough confirmation blocks for expiration
    await waitBlock(sentState.expiration + 2 * raiden.config.confirmationBlocks + 1);

    expect(raiden.output).toContainEqual(transferExpire.request(undefined, meta));
  });
});

describe('monitorSecretRegistryEpic', () => {
  test('unknown secret', async () => {
    expect.assertions(1);

    const raiden = await makeRaiden();
    const { secretRegistryContract } = raiden.deps;

    // an emitted secret which isn't of interest is ignored
    const unknownSecret = makeSecret();
    const txBlock = raiden.deps.provider.blockNumber;
    await providersEmit(
      {},
      makeLog({
        blockNumber: txBlock,
        transactionHash: makeHash(),
        filter: secretRegistryContract.filters.SecretRevealed(getSecrethash(unknownSecret), null),
        data: unknownSecret, // non-indexed secret
      }),
    );
    await waitBlock();
    expect(raiden.output).not.toContainEqual(
      transferSecretRegister.success(expect.anything(), expect.anything()),
    );
  });

  test('ignore expired registered block', async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    const { secretRegistryContract } = raiden.deps;
    const sentState = await ensureTransferPending([raiden, partner]);

    await waitBlock(sentState.expiration);
    const txBlock = sentState.expiration;
    await providersEmit(
      {},
      makeLog({
        blockNumber: txBlock,
        filter: secretRegistryContract.filters.SecretRevealed(secrethash, null),
        data: secret, // non-indexed secret
      }),
    );
    await waitBlock(sentState.expiration + raiden.config.confirmationBlocks);

    expect(raiden.output).not.toContainEqual(
      transferSecretRegister.success(expect.objectContaining({ confirmed: true }), meta),
    );
  });

  test('success: valid register emitted', async () => {
    expect.assertions(3);

    const [raiden, partner] = await makeRaidens(2);
    const { secretRegistryContract } = raiden.deps;

    await ensureTransferPending([raiden, partner]);
    partner.stop(); // prevent partner from trying to unlocking

    const txBlock = raiden.deps.provider.blockNumber;
    const txHash = makeHash();
    // an emitted secret which isn't of interest is ignored
    await waitBlock(txBlock);
    await providersEmit(
      {},
      makeLog({
        blockNumber: txBlock,
        transactionHash: txHash,
        filter: secretRegistryContract.filters.SecretRevealed(secrethash, null),
        data: secret, // non-indexed secret
      }),
    );
    await waitBlock(txBlock + 1);
    await waitBlock(txBlock + raiden.config.confirmationBlocks + 1);

    expect(raiden.output).toContainEqual(
      transferSecretRegister.success({ secret, txHash, txBlock, confirmed: true }, meta),
    );
    await expect(getOrWaitTransfer(raiden, meta)).resolves.toMatchObject({
      secret,
      secretRegistered: { txBlock, txHash, ts: expect.any(Number) },
    });
    expect(getChannel(raiden, partner).own.locks).toContainEqual(
      expect.objectContaining({
        secrethash,
        registered: true,
      }),
    );
  });
});
