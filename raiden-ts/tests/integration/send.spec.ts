import {
  amount,
  ensureChannelIsDeposited,
  ensureTransferPending,
  ensureTransferUnlocked,
  expectChannelsAreInSync,
  fee,
  getChannel,
  getOrWaitTransfer,
  metadataFromClients,
  presenceFromClient,
  secret,
  secrethash,
  tokenNetwork,
} from './fixtures';
import {
  makeLog,
  makeRaiden,
  makeRaidens,
  mockedClock,
  providersEmit,
  sleep,
  waitBlock,
} from './mocks';

import { BigNumber } from '@ethersproject/bignumber';
import { MaxUint256, Zero } from '@ethersproject/constants';
import { keccak256 } from '@ethersproject/keccak256';
import { firstValueFrom } from 'rxjs';
import { first, pluck } from 'rxjs/operators';

import { raidenConfigUpdate } from '@/actions';
import { channelClose } from '@/channels/actions';
import { channelUniqueKey } from '@/channels/utils';
import { Capabilities } from '@/constants';
import { messageReceived, messageSend } from '@/messages/actions';
import type { Processed } from '@/messages/types';
import { LockedTransfer, LockExpired, MessageType, Unlock } from '@/messages/types';
import { signMessage } from '@/messages/utils';
import { pathFind } from '@/services/actions';
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

import { makeHash } from '../utils';
import type { MockedRaiden } from './mocks';

const direction = Direction.SENT;
const paymentId = makePaymentId();
const value = amount;
const meta = { secrethash, direction };

describe('resolve transfer', () => {
  test('success with encryptSecret', async () => {
    const [raiden, partner] = await makeRaidens(2);
    await ensureChannelIsDeposited([raiden, partner]);

    raiden.store.dispatch(
      transfer.request(
        {
          tokenNetwork,
          target: partner.address,
          value,
          paymentId,
          secret,
          resolved: false,
        },
        meta,
      ),
    );
    await sleep();
    expect(raiden.output).toContainEqual(
      transfer.request(
        {
          tokenNetwork,
          target: partner.address,
          value,
          paymentId,
          secret,
          resolved: true,
          metadata: {
            routes: [
              expect.objectContaining({
                route: [raiden.address, partner.address],
              }),
            ],
            secret: expect.any(String),
          },
          partner: partner.address,
          userId: partner.store.getState().transport.setup!.userId,
          fee: Zero as Int<32>,
        },
        meta,
      ),
    );
  });

  test('failure target presence offline passes through', async () => {
    const [raiden, partner] = await makeRaidens(2);
    await ensureChannelIsDeposited([raiden, partner]);
    raiden.store.dispatch(raidenConfigUpdate({ pollingInterval: 100 }));
    raiden.store.dispatch(presenceFromClient(partner, false));

    raiden.store.dispatch(
      transfer.request(
        {
          tokenNetwork,
          target: partner.address,
          value,
          paymentId,
          secret,
          resolved: false,
          paths: [{ path: [raiden.address, partner.address], fee: Zero as Int<32> }],
        },
        meta,
      ),
    );
    await sleep();
    expect(raiden.output).toContainEqual(pathFind.failure(expect.any(Error), expect.anything()));
    expect(raiden.output).toContainEqual(
      transfer.failure(
        expect.objectContaining({ message: expect.stringContaining('offline') }),
        meta,
      ),
    );
  });
});

describe('send transfer', () => {
  test('transferSigned success and cached', async () => {
    expect.assertions(6);

    const [raiden, partner] = await makeRaidens(2);
    await ensureChannelIsDeposited([raiden, partner]);

    const requestTs = Math.round(Date.now() / 1e3);
    const request = transfer.request(
      {
        tokenNetwork,
        target: partner.address,
        value,
        paymentId,
        secret,
        ...metadataFromClients([raiden, partner]),
      },
      meta,
    );
    raiden.store.dispatch(request);
    await sleep();

    raiden.store.dispatch(request);
    await sleep();

    const expectedLockedTransfer = expect.objectContaining({
      type: MessageType.LOCKED_TRANSFER,
      payment_identifier: paymentId,
      lock: {
        secrethash,
        amount: value.add(fee),
        expiration: BigNumber.from(
          Math.round(raiden.config.expiryFactor * raiden.config.revealTimeout),
        ).add(requestTs),
      },
      signature: expect.any(String),
    });
    expect(raiden.output).toContainEqual(
      transferSigned(
        {
          message: expectedLockedTransfer,
          fee,
          partner: partner.address,
          userId: (await firstValueFrom(partner.deps.matrix$)).getUserId()!,
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
        value: MaxUint256 as UInt<32>,
        paymentId,
        secret,
        ...metadataFromClients([raiden, partner]),
      },
      meta,
    );
    raiden.store.dispatch(request);
    await sleep();

    expect(raiden.output).toContainEqual(
      transfer.failure(
        expect.objectContaining({ message: expect.stringContaining('overflow') }),
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
          paymentId,
          secret,
          ...metadataFromClients([raiden, partner]),
        },
        meta,
      ),
    );
    await sleep();

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

      // await sleep(sentState.expiration * 1e3 - Date.now() - 2e3);

      const unlock = firstValueFrom(
        raiden.action$.pipe(first(transferUnlock.success.is), pluck('payload', 'message')),
      );
      const txBlock = raiden.deps.provider.blockNumber;
      await providersEmit(
        {},
        makeLog({
          blockNumber: txBlock,
          filter: secretRegistryContract.filters.SecretRevealed(secrethash),
          data: secret,
        }),
      );
      // confirm secretRegistered
      await waitBlock(txBlock + raiden.config.confirmationBlocks + 1, false);
      mockedClock.clock.setSystemTime(sentState.expiration * 1e3 + 2e3);
      await sleep(1e3);
      // await sleep(sentState.expiration * 1e3 - Date.now() + 2e3);

      const expectedUnlock = expect.objectContaining({
        type: MessageType.UNLOCK,
        locksroot: keccak256([]),
        transferred_amount: sentState.transfer.lock.amount,
        locked_amount: Zero,
        secret,
        message_identifier: expect.toBeBigNumber(),
        signature: expect.any(String),
      });
      await expect(unlock).resolves.toEqual(expectedUnlock);
      expect(raiden.output).toContainEqual(
        transferUnlock.success(
          {
            message: expectedUnlock,
            partner: partner.address,
            userId: (await firstValueFrom(partner.deps.matrix$)).getUserId()!,
          },
          meta,
        ),
      );

      const finalState = await getOrWaitTransfer(raiden, meta, (doc) => !!doc.unlockProcessed);
      expect(finalState).toMatchObject({
        unlock: expectedUnlock,
        unlockProcessed: expect.anything(),
      });

      const promise = firstValueFrom(raiden.action$.pipe(first(transferUnlock.success.is)));
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
      // ensure it reused the previous cached expired message, possibly from db
      expect((await promise).payload.message).toEqual(finalState.unlock);

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
        firstValueFrom(raiden.action$.pipe(first(transferUnlock.success.is))),
      ).resolves.toBeDefined();
      await sleep();

      expectChannelsAreInSync([raiden, partner]);
    });

    test('fail: channel closed', async () => {
      expect.assertions(4);

      const [raiden, partner] = await makeRaidens(2);
      await ensureTransferPending([raiden, partner]);

      const promise = firstValueFrom(
        raiden.action$.pipe(first(isResponseOf(transferUnlock, meta))),
      );
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
  });

  describe('transferExpire.request', () => {
    test('success and cached', async () => {
      expect.assertions(6);

      const [raiden, partner] = await makeRaidens(2);
      const sentState = await ensureTransferPending([raiden, partner]);

      await sleep(sentState.expiration * 1e3 - Date.now() + raiden.config.httpTimeout * 2);

      const expectedExpired = expect.objectContaining({
        type: MessageType.LOCK_EXPIRED,
        locksroot: keccak256([]),
        transferred_amount: Zero,
        locked_amount: Zero,
        message_identifier: expect.toBeBigNumber(),
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

      const promise = firstValueFrom(raiden.action$.pipe(first(transferExpire.success.is)));
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

      const promise = firstValueFrom(
        raiden.action$.pipe(first(isResponseOf(transferExpire, meta))),
      );
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

      await sleep(sentState.expiration * 1e3 - Date.now() - 2e3);
      const promise = firstValueFrom(
        raiden.action$.pipe(first(isResponseOf(transferExpire, meta))),
      );

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

      await sleep(sentState.expiration * 1e3 - Date.now() + 1e3);
      const promise = firstValueFrom(
        raiden.action$.pipe(first(isResponseOf(transferExpire, meta))),
      );
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
          paymentId,
          ...metadataFromClients([raiden, partner], Zero as Int<32>),
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
    await partner.stop();

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
    await partner.stop();
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
    await partner.stop();

    const sentState = await pendingTransfer([raiden, partner]);

    // expiration confirmed
    await sleep(sentState.expiration * 1e3 - Date.now() + 2e3);
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
    expect.assertions(2);

    const [raiden, partner] = await makeRaidens(2);
    const sentState = await ensureTransferPending([raiden, partner]);

    // don't emit if transfer didn't expire
    await sleep(sentState.expiration * 1e3 - Date.now() - 2e3);
    expect(raiden.output).not.toContainEqual(
      transferExpire.request(expect.anything(), expect.anything()),
    );

    // expiration confirmed
    await sleep(4e3);
    expect(raiden.output).toContainEqual(transferExpire.request(undefined, meta));
  }, 10e3);

  test("don't expire if secret registered before expiration", async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    const { secretRegistryContract } = raiden.deps;
    const sentState = await ensureTransferPending([raiden, partner]);
    await partner.stop();

    const txBlock = raiden.deps.provider.blockNumber + 1;
    await providersEmit(
      {},
      makeLog({
        blockNumber: txBlock,
        filter: secretRegistryContract.filters.SecretRevealed(secrethash),
        data: secret,
      }),
    );
    await waitBlock(txBlock + raiden.config.confirmationBlocks + 1, false);
    // enough confirmation blocks for expiration
    await sleep(sentState.expiration * 1e3 - Date.now() + 10e3);

    expect(raiden.output).not.toContainEqual(
      transferExpire.request(expect.anything(), expect.anything()),
    );
  });

  test('success: if secret registered after expiration', async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    const { secretRegistryContract } = raiden.deps;
    const sentState = await ensureTransferPending([raiden, partner]);
    await partner.stop();

    await sleep(sentState.expiration * 1e3 - Date.now()); // goto expiration timestamp
    const txBlock = raiden.deps.provider.blockNumber + 1; // secret registered at this block
    await providersEmit(
      {},
      makeLog({
        blockNumber: txBlock,
        filter: secretRegistryContract.filters.SecretRevealed(secrethash),
        data: secret,
      }),
    );
    await waitBlock(txBlock + raiden.config.confirmationBlocks + 1, false); // confirm
    await sleep(10e3); // give some time to check

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
        filter: secretRegistryContract.filters.SecretRevealed(getSecrethash(unknownSecret)),
        data: unknownSecret, // non-indexed secret
      }),
    );
    await waitBlock(txBlock + raiden.config.confirmationBlocks + 1);

    expect(raiden.output).not.toContainEqual(
      transferSecretRegister.success(expect.anything(), expect.anything()),
    );
  });

  test('ignore expired registered block', async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    const { secretRegistryContract } = raiden.deps;
    const sentState = await ensureTransferPending([raiden, partner]);

    await sleep(sentState.expiration * 1e3 - Date.now());
    const txBlock = raiden.deps.provider.blockNumber + 1;
    await providersEmit(
      {},
      makeLog({
        blockNumber: txBlock,
        filter: secretRegistryContract.filters.SecretRevealed(secrethash, null),
        data: secret, // non-indexed secret
      }),
    );
    await waitBlock(txBlock + raiden.config.confirmationBlocks + 1, false);
    await sleep(10e3);

    expect(raiden.output).not.toContainEqual(
      transferSecretRegister.success(expect.anything(), expect.anything()),
    );
  });

  test('success: valid register emitted', async () => {
    expect.assertions(3);

    const [raiden, partner] = await makeRaidens(2);
    const { secretRegistryContract } = raiden.deps;

    await ensureTransferPending([raiden, partner]);
    await partner.stop(); // prevent partner from trying to unlocking

    const txBlock = raiden.deps.provider.blockNumber;
    const txHash = makeHash();
    // an emitted secret which isn't of interest is ignored
    await providersEmit(
      {},
      makeLog({
        blockNumber: txBlock,
        transactionHash: txHash,
        filter: secretRegistryContract.filters.SecretRevealed(secrethash),
        data: secret, // non-indexed secret
      }),
    );
    await waitBlock(txBlock + raiden.config.confirmationBlocks + 1, false);
    await sleep(2e3);

    const txTimestamp = await firstValueFrom(raiden.deps.getBlockTimestamp(txBlock));
    expect(raiden.output).toContainEqual(
      transferSecretRegister.success(
        {
          txTimestamp,
          secret,
          txHash,
          txBlock,
          confirmed: true,
        },
        meta,
      ),
    );
    await expect(getOrWaitTransfer(raiden, meta)).resolves.toMatchObject({
      secret,
      secretRegistered: { txBlock, txHash, ts: txTimestamp * 1e3 },
    });
    expect(getChannel(raiden, partner).own.locks).toContainEqual(
      expect.objectContaining({
        secrethash,
        registered: true,
      }),
    );
  });
});
