/* eslint-disable @typescript-eslint/no-explicit-any */
import { bigNumberify, BigNumber, keccak256, hexlify, randomBytes } from 'ethers/utils';
import { Zero, HashZero, One } from 'ethers/constants';
import { of, EMPTY, timer, merge } from 'rxjs';
import {
  first,
  tap,
  toArray,
  filter,
  take,
  pluck,
  takeUntil,
  mergeMap,
  ignoreElements,
  last,
} from 'rxjs/operators';

import {
  newBlock,
  tokenMonitored,
  channelOpen,
  channelDeposit,
  channelClose,
  channelSettle,
} from 'raiden-ts/channels/actions';
import { raidenConfigUpdate } from 'raiden-ts/actions';
import {
  MessageType,
  Processed,
  Delivered,
  LockedTransfer,
  SecretRequest,
  SecretReveal,
  LockExpired,
  RefundTransfer,
  WithdrawRequest,
} from 'raiden-ts/messages/types';
import { encodeJsonMessage, signMessage } from 'raiden-ts/messages/utils';
import { messageSend, messageReceived } from 'raiden-ts/messages/actions';
import {
  transfer,
  transferSigned,
  transferSecret,
  transferUnlock,
  transferProcessed,
  transferSecretRequest,
  transferSecretReveal,
  transferExpire,
  transferRefunded,
  transferUnlockProcessed,
  transferExpireProcessed,
  withdrawReceive,
  transferSecretRegister,
} from 'raiden-ts/transfers/actions';
import {
  transferGenerateAndSignEnvelopeMessageEpic,
  transferProcessedReceivedEpic,
  transferSecretRequestedEpic,
  transferSecretRevealEpic,
  transferSecretRevealedEpic,
  transferUnlockProcessedReceivedEpic,
  transferAutoExpireEpic,
  initQueuePendingEnvelopeMessagesEpic,
  transferExpireProcessedEpic,
  transferChannelClosedEpic,
  transferRetryMessageEpic,
  transferReceivedReplyProcessedEpic,
  transferRefundedEpic,
  withdrawRequestReceivedEpic,
  withdrawSendConfirmationEpic,
  monitorSecretRegistryEpic,
  transferSuccessOnSecretRegisteredEpic,
} from 'raiden-ts/transfers/epics';
import { matrixPresence } from 'raiden-ts/transport/actions';
import { UInt, Address, Hash, Signed, isntNil } from 'raiden-ts/utils/types';
import { ActionType } from 'raiden-ts/utils/actions';
import { makeMessageId, makeSecret, getSecrethash } from 'raiden-ts/transfers/utils';
import { Direction } from 'raiden-ts/transfers/state';

import { epicFixtures } from '../fixtures';
import { raidenEpicDeps, makeLog } from '../mocks';

describe('send transfers', () => {
  let depsMock: ReturnType<typeof raidenEpicDeps>;
  let token: ReturnType<typeof epicFixtures>['token'],
    tokenNetwork: ReturnType<typeof epicFixtures>['tokenNetwork'],
    channelId: ReturnType<typeof epicFixtures>['channelId'],
    partner: ReturnType<typeof epicFixtures>['partner'],
    settleTimeout: ReturnType<typeof epicFixtures>['settleTimeout'],
    isFirstParticipant: ReturnType<typeof epicFixtures>['isFirstParticipant'],
    txHash: ReturnType<typeof epicFixtures>['txHash'],
    matrixServer: ReturnType<typeof epicFixtures>['matrixServer'],
    partnerUserId: ReturnType<typeof epicFixtures>['partnerUserId'],
    partnerSigner: ReturnType<typeof epicFixtures>['partnerSigner'],
    paymentId: ReturnType<typeof epicFixtures>['paymentId'],
    fee: ReturnType<typeof epicFixtures>['fee'],
    paths: ReturnType<typeof epicFixtures>['paths'],
    key: ReturnType<typeof epicFixtures>['key'],
    action$: ReturnType<typeof epicFixtures>['action$'],
    state$: ReturnType<typeof epicFixtures>['state$'];
  const direction = Direction.SENT;

  beforeEach(() => {
    depsMock = raidenEpicDeps();
    ({
      token,
      tokenNetwork,
      channelId,
      partner,
      settleTimeout,
      isFirstParticipant,
      txHash,
      matrixServer,
      partnerUserId,
      partnerSigner,
      paymentId,
      fee,
      paths,
      key,
      action$,
      state$,
    } = epicFixtures(depsMock));
  });

  afterEach(() => {
    jest.clearAllMocks();
    action$.complete();
    state$.complete();
    depsMock.latest$.complete();
  });

  describe('transfer: request', () => {
    const secret = makeSecret(),
      secrethash = getSecrethash(secret),
      value = bigNumberify(10) as UInt<32>,
      openBlock = 121;

    test('transferSigned success and cached', async () => {
      expect.assertions(2);

      const otherPartner1 = hexlify(randomBytes(20)) as Address,
        otherPartner2 = hexlify(randomBytes(20)) as Address,
        otherDeposit = bigNumberify(800) as UInt<32>;

      const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');
      const promise = transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
        .pipe(
          tap((action) => action$.next(action)),
          toArray(),
        )
        .toPromise();

      [
        tokenMonitored({ token, tokenNetwork, fromBlock: 1 }),
        // a couple of channels with unrelated partners, with larger deposits
        channelOpen.success(
          {
            id: channelId - 2,
            settleTimeout,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner: otherPartner2 },
        ),
        channelDeposit.success(
          {
            id: channelId - 2,
            participant: depsMock.address,
            totalDeposit: otherDeposit,
            txHash,
            txBlock: openBlock + 1,
            confirmed: true,
          },
          { tokenNetwork, partner: otherPartner2 },
        ),
        channelOpen.success(
          {
            id: channelId - 1,
            settleTimeout,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner: otherPartner1 },
        ),
        channelDeposit.success(
          {
            id: channelId - 1,
            participant: depsMock.address,
            totalDeposit: otherDeposit,
            txHash,
            txBlock: openBlock + 1,
            confirmed: true,
          },
          { tokenNetwork, partner: otherPartner1 },
        ),
        // but transfer should prefer this direct channel
        channelOpen.success(
          {
            id: channelId,
            settleTimeout,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
        channelDeposit.success(
          {
            id: channelId,
            participant: depsMock.address,
            totalDeposit: bigNumberify(500) as UInt<32>,
            txHash,
            txBlock: openBlock + 1,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: 125 }),
        matrixPresence.success(
          {
            userId: `@${otherPartner1.toLowerCase()}:${matrixServer}`,
            available: true,
            ts: Date.now(),
          },
          { address: otherPartner1 },
        ),
        matrixPresence.success(
          {
            userId: `@${otherPartner2.toLowerCase()}:${matrixServer}`,
            available: true,
            ts: Date.now(),
          },
          { address: otherPartner2 },
        ),
        matrixPresence.success(
          { userId: partnerUserId, available: true, ts: Date.now() },
          { address: partner },
        ),
        transfer.request(
          { tokenNetwork, target: partner, value, secret, paths, paymentId },
          { secrethash, direction },
        ),
        // double transfer to test caching
        transfer.request(
          { tokenNetwork, target: partner, value, paths, paymentId },
          { secrethash, direction },
        ),
      ].forEach((a) => action$.next(a));
      action$.complete();

      await expect(promise).resolves.toEqual(
        expect.arrayContaining([
          transferSigned(
            {
              message: expect.objectContaining({
                type: MessageType.LOCKED_TRANSFER,
                message_identifier: expect.any(BigNumber),
                signature: expect.any(String),
              }),
              fee,
              partner,
            },
            { secrethash, direction },
          ),
          transferSecret({ secret }, { secrethash, direction }),
        ]),
      );

      // second transfer should have been cached
      expect(signerSpy).toHaveBeenCalledTimes(1);
      signerSpy.mockRestore();
    });

    test('transferSigned fail no channel with route partner', async () => {
      expect.assertions(1);

      const closingPartner = '0x0100000000000000000000000000000000000000' as Address;
      const promise = transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
        .pipe(first())
        .toPromise();

      [
        tokenMonitored({ token, tokenNetwork, fromBlock: 1 }),
        // channel with closingPartner: closed
        channelOpen.success(
          {
            id: channelId + 1,
            settleTimeout,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner: closingPartner },
        ),
        channelClose.success(
          {
            id: channelId + 1,
            participant: closingPartner,
            txHash,
            txBlock: openBlock + 1,
            confirmed: true,
          },
          { tokenNetwork, partner: closingPartner },
        ),
        newBlock({ blockNumber: 125 }),
        matrixPresence.success(
          { userId: partnerUserId, available: true, ts: Date.now() },
          { address: partner },
        ),
        transfer.request(
          {
            tokenNetwork,
            target: partner,
            value,
            secret,
            paths: [{ path: [closingPartner], fee }],
            paymentId,
          },
          { secrethash, direction },
        ),
      ].forEach((a) => action$.next(a));
      action$.complete();

      await expect(promise).resolves.toMatchObject({
        type: transfer.failure.type,
        payload: expect.any(Error),
        error: true,
        meta: { secrethash, direction },
      });
    });
  });

  describe('transfer: epics depending on pending transfer', () => {
    const secret = makeSecret(),
      secrethash = getSecrethash(secret),
      value = bigNumberify(10) as UInt<32>,
      openBlock = 121;

    let signedTransfer: Signed<LockedTransfer>;

    beforeEach(async () => {
      [
        matrixPresence.success(
          { userId: partnerUserId, available: true, ts: Date.now() },
          { address: partner },
        ),
        tokenMonitored({ token, tokenNetwork, fromBlock: 1 }),
        channelOpen.success(
          {
            id: channelId,
            settleTimeout,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
        channelDeposit.success(
          {
            id: channelId,
            participant: depsMock.address,
            totalDeposit: bigNumberify(500) as UInt<32>,
            txHash,
            txBlock: openBlock + 1,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: 125 }),
      ].forEach((a) => action$.next(a));

      const promise = transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
        .pipe(
          tap((a) => action$.next(a)),
          take(2),
          filter(transferSigned.is),
        )
        .toPromise();
      action$.next(
        transfer.request(
          { tokenNetwork, target: partner, value, secret, paths, paymentId },
          { secrethash, direction },
        ),
      );
      signedTransfer = (await promise).payload.message;

      action$.next(newBlock({ blockNumber: 126 }));
    });

    describe('transferUnlock.request', () => {
      test('success and cached, after expiration with registered secret', async () => {
        expect.assertions(2);

        // secret revealed action is only ever emitted when received from recipient

        const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

        const promise = transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
          .pipe(
            tap((action) => action$.next(action)),
            toArray(),
          )
          .toPromise();

        [
          // lock expired, but secret got registered, so unlock must still be accepted
          transferSecretRegister.success(
            {
              secret,
              txBlock: signedTransfer.lock.expiration.toNumber() - 1,
              txHash,
              confirmed: true,
            },
            { secrethash, direction },
          ),
          newBlock({ blockNumber: signedTransfer.lock.expiration.toNumber() + 1 }),
          transferUnlock.request(undefined, { secrethash, direction }),
          transferUnlock.request(undefined, { secrethash, direction }),
        ].forEach((a) => action$.next(a));
        action$.complete();

        await expect(promise).resolves.toEqual(
          expect.arrayContaining([
            transferUnlock.success(
              {
                message: expect.objectContaining({
                  type: MessageType.UNLOCK,
                  locksroot: keccak256([]),
                  transferred_amount: value.add(fee),
                  locked_amount: Zero,
                  message_identifier: expect.any(BigNumber),
                  signature: expect.any(String),
                }),
                partner,
              },
              { secrethash, direction },
            ),
          ]),
        );

        expect(signerSpy).toHaveBeenCalledTimes(1);
        signerSpy.mockRestore();
      });

      test('fail channel gone', async () => {
        expect.assertions(2);

        // update state: transfer still pending, but channel gets settled
        const closeBlock = 125;
        [
          channelClose.success(
            {
              id: channelId,
              participant: partner,
              txHash,
              txBlock: closeBlock,
              confirmed: true,
            },
            { tokenNetwork, partner },
          ),
          newBlock({ blockNumber: closeBlock + settleTimeout + 1 }),
          channelSettle.success(
            {
              id: channelId,
              txHash,
              txBlock: closeBlock + settleTimeout + 1,
              confirmed: true,
            },
            { tokenNetwork, partner },
          ),
          newBlock({ blockNumber: closeBlock + settleTimeout + 2 }),
        ].forEach((a) => action$.next(a));
        action$.complete();

        const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

        const promise = transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
          .pipe(
            tap((a) => action$.next(a)),
            toArray(),
          )
          .toPromise();

        action$.next(transferUnlock.request(undefined, { secrethash, direction }));

        await expect(promise).resolves.toEqual(
          expect.not.arrayContaining([
            expect.objectContaining({
              type: transferUnlock.success.type,
              meta: { secrethash, direction },
            }),
          ]),
        );

        // unlock shouldn't be called and signed
        expect(signerSpy).toHaveBeenCalledTimes(0);
        signerSpy.mockRestore();
      });

      test('fail channel closed', async () => {
        expect.assertions(2);

        // secret revealed action is only ever emitted when received from recipient
        const closeBlock = 125;
        action$.next(
          channelClose.success(
            {
              id: channelId,
              participant: partner,
              txHash,
              txBlock: closeBlock,
              confirmed: true,
            },
            { tokenNetwork, partner },
          ),
        );

        const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

        const promise = transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
          .pipe(
            tap((a) => action$.next(a)),
            toArray(),
          )
          .toPromise();

        action$.next(transferUnlock.request(undefined, { secrethash, direction }));
        action$.complete();

        await expect(promise).resolves.toEqual(
          expect.not.arrayContaining([
            expect.objectContaining({
              type: transferUnlock.success.type,
              meta: { secrethash, direction },
            }),
          ]),
        );

        // unlock shouldn't be called and signed
        expect(signerSpy).toHaveBeenCalledTimes(0);
        signerSpy.mockRestore();
      });

      test('fail lock expired', async () => {
        expect.assertions(2);

        // secret revealed action is only ever emitted when received from recipient
        action$.next(newBlock({ blockNumber: signedTransfer.lock.expiration.toNumber() + 1 }));

        const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

        const promise = transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
          .pipe(
            tap((a) => action$.next(a)),
            toArray(),
          )
          .toPromise();

        action$.next(transferUnlock.request(undefined, { secrethash, direction }));
        action$.complete();

        await expect(promise).resolves.toEqual(
          expect.not.arrayContaining([
            expect.objectContaining({
              type: transferUnlock.success.type,
              meta: { secrethash, direction },
            }),
          ]),
        );

        // unlock shouldn't be called and signed
        expect(signerSpy).toHaveBeenCalledTimes(0);
        signerSpy.mockRestore();
      });
    });

    describe('transferExpire.request', () => {
      test('success and cached', async () => {
        expect.assertions(2);

        // secret revealed action is only ever emitted when received from recipient
        action$.next(newBlock({ blockNumber: signedTransfer.lock.expiration.toNumber() + 1 }));

        const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

        const promise = transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
          .pipe(
            tap((a) => action$.next(a)),
            toArray(),
          )
          .toPromise();

        [
          transferExpire.request(undefined, { secrethash, direction }),
          transferExpire.request(undefined, { secrethash, direction }),
        ].forEach((a) => action$.next(a));
        action$.complete();

        await expect(promise).resolves.toEqual(
          expect.arrayContaining([
            transferExpire.success(
              {
                message: expect.objectContaining({
                  type: MessageType.LOCK_EXPIRED,
                  locksroot: keccak256([]),
                  transferred_amount: Zero,
                  locked_amount: Zero,
                  message_identifier: expect.any(BigNumber),
                  signature: expect.any(String),
                }),
                partner,
              },
              { secrethash, direction },
            ),
          ]),
        );

        expect(signerSpy).toHaveBeenCalledTimes(1);
        signerSpy.mockRestore();
      });

      test('fail channel closed', async () => {
        expect.assertions(2);

        // secret revealed action is only ever emitted when received from recipient
        const closeBlock = 125;
        [
          channelClose.success(
            {
              id: channelId,
              participant: partner,
              txHash,
              txBlock: closeBlock,
              confirmed: true,
            },
            { tokenNetwork, partner },
          ),
          newBlock({ blockNumber: signedTransfer.lock.expiration.toNumber() + 1 }),
        ].forEach((a) => action$.next(a));

        const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

        const promise = transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
          .pipe(
            tap((a) => action$.next(a)),
            toArray(),
          )
          .toPromise();

        action$.next(transferExpire.request(undefined, { secrethash, direction }));
        action$.complete();

        await expect(promise).resolves.toEqual(
          expect.arrayContaining([
            expect.objectContaining(
              transferExpire.failure(expect.any(Error), { secrethash, direction }),
            ),
          ]),
        );

        // unlock shouldn't be called and signed
        expect(signerSpy).toHaveBeenCalledTimes(0);
        signerSpy.mockRestore();
      });

      test('fail lock not expired yet', async () => {
        expect.assertions(2);

        // secret revealed action is only ever emitted when received from recipient
        action$.next(newBlock({ blockNumber: signedTransfer.lock.expiration.toNumber() - 1 }));

        const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

        const promise = transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
          .pipe(
            tap((a) => action$.next(a)),
            toArray(),
          )
          .toPromise();

        action$.next(transferExpire.request(undefined, { secrethash, direction }));
        action$.complete();

        await expect(promise).resolves.toEqual(
          expect.arrayContaining([
            expect.objectContaining(
              transferExpire.failure(expect.any(Error), { secrethash, direction }),
            ),
          ]),
        );

        // unlock shouldn't be called and signed
        expect(signerSpy).toHaveBeenCalledTimes(0);
        signerSpy.mockRestore();
      });

      test('fail transfer gone', async () => {
        expect.assertions(2);

        // secret revealed action is only ever emitted when received from recipient
        action$.next(newBlock({ blockNumber: signedTransfer.lock.expiration.toNumber() + 1 }));

        const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

        const promise = transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
          .pipe(
            tap((a) => action$.next(a)),
            toArray(),
          )
          .toPromise();

        const secrethash = HashZero as Hash; // no transfer with HashZero as secrethash/
        action$.next(transferExpire.request(undefined, { secrethash, direction }));
        action$.complete();

        await expect(promise).resolves.toEqual(
          expect.arrayContaining([
            expect.objectContaining(
              transferExpire.failure(expect.any(Error), { secrethash, direction }),
            ),
          ]),
        );

        // unlock shouldn't be called and signed
        expect(signerSpy).toHaveBeenCalledTimes(0);
        signerSpy.mockRestore();
      });

      test('fail transfer unlocked', async () => {
        expect.assertions(3);

        const promise = transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
          .pipe(
            tap((a) => action$.next(a)),
            toArray(),
          )
          .toPromise();

        action$.next(transferUnlock.request(undefined, { secrethash, direction }));

        // expect unlock to be set
        await expect(
          depsMock.latest$
            .pipe(pluck('state', 'sent', secrethash, 'unlock', '1'), first(isntNil))
            .toPromise(),
        ).resolves.toMatchObject({
          type: MessageType.UNLOCK,
          signature: expect.any(String),
        });

        const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

        action$.next(newBlock({ blockNumber: signedTransfer.lock.expiration.toNumber() + 1 }));
        action$.next(transferExpire.request(undefined, { secrethash, direction }));
        action$.complete();

        await expect(promise).resolves.toEqual(
          expect.arrayContaining([
            expect.objectContaining(
              transferExpire.failure(expect.any(Error), { secrethash, direction }),
            ),
          ]),
        );

        // unlock shouldn't be called and signed
        expect(signerSpy).toHaveBeenCalledTimes(0);
        signerSpy.mockRestore();
      });
    });

    describe('transferRetryMessageEpic', () => {
      beforeEach(() => action$.next(raidenConfigUpdate({ httpTimeout: 50 })));

      test('transferSigned', async () => {
        expect.assertions(2);

        const msg: Processed = {
          type: MessageType.PROCESSED,
          message_identifier: signedTransfer.message_identifier,
        };
        const processed = await signMessage(partnerSigner, msg);

        // wait until seeing 3 messageSend.request to send Processed
        action$
          .pipe(filter(messageSend.request.is), take(3), ignoreElements())
          .subscribe(undefined, undefined, () =>
            action$.next(transferProcessed({ message: processed }, { secrethash, direction })),
          );

        const requests = [];
        transferRetryMessageEpic(action$, state$, depsMock)
          .pipe(filter(messageSend.request.is))
          .subscribe((a) => {
            requests.push(a);
            action$.next(a);
            // for each message request, emit a success
            action$.next(messageSend.success(undefined, a.meta));
          });

        // as signedTransfer is already in state, use initQueuePendingEnvelopeMessagesEpic
        initQueuePendingEnvelopeMessagesEpic(
          EMPTY,
          depsMock.latest$.pipe(pluck('state')),
        ).subscribe((a) => action$.next(a));

        // const promise = action$.pipe(first(messageSend.request.is)).toPromise();
        // await promise;

        // first message request comes right away after transferSigned
        expect(requests.length).toBe(1);

        // 1st msg, +2 messages retried after httpTimeout each, then completes
        await new Promise((resolve) => setTimeout(resolve, 500));
        expect(requests.length).toBe(3);
      });

      test('transferUnlock.success', async () => {
        expect.assertions(2);

        // upon transferUnlock.success, generate Processed for it,
        // but receives only after 3 message requests
        merge(
          // generate & sign Processed for the Unlock
          action$.pipe(
            first(transferUnlock.success.is),
            mergeMap((action) =>
              signMessage(partnerSigner, {
                type: MessageType.PROCESSED,
                message_identifier: action.payload.message.message_identifier,
              }),
            ),
          ),
          // wait until seeing 3 messageSend.request to complete
          action$.pipe(filter(messageSend.request.is), take(3), ignoreElements()),
        )
          .pipe(last())
          .subscribe((signed) =>
            action$.next(transferUnlockProcessed({ message: signed }, { secrethash, direction })),
          );

        const requests = [];
        transferRetryMessageEpic(action$, state$, depsMock)
          .pipe(filter(messageSend.request.is))
          .subscribe((a) => {
            requests.push(a);
            action$.next(a);
            // for each message request, emit a success
            action$.next(messageSend.success(undefined, a.meta));
          });

        // expire lock, to init messageSend.request retry loop
        await transferGenerateAndSignEnvelopeMessageEpic(
          of(transferUnlock.request(undefined, { secrethash, direction })),
          depsMock.latest$.pipe(pluck('state')),
          depsMock,
        )
          .pipe(tap((a) => action$.next(a)))
          .toPromise();

        // first message request comes right away after transferExpire.success
        expect(requests.length).toBe(1);

        // 1st msg, +2 messages retried after httpTimeout each, then completes
        await new Promise((resolve) => setTimeout(resolve, 500));
        expect(requests.length).toBe(3);
      });

      test('transferExpire.success', async () => {
        expect.assertions(2);

        action$.next(newBlock({ blockNumber: signedTransfer.lock.expiration.toNumber() + 6 }));

        // upon transferExpire.success, generate Processed for it,
        // but receives only after 3 message requests
        merge(
          // generate & sign Processed for the LockExpired
          action$.pipe(
            first(transferExpire.success.is),
            mergeMap((action) =>
              signMessage(partnerSigner, {
                type: MessageType.PROCESSED,
                message_identifier: action.payload.message.message_identifier,
              }),
            ),
          ),
          // wait until seeing 3 messageSend.request to complete
          action$.pipe(filter(messageSend.request.is), take(3), ignoreElements()),
        )
          .pipe(last())
          .subscribe((processed) =>
            action$.next(
              transferExpireProcessed({ message: processed }, { secrethash, direction }),
            ),
          );

        const requests = [];
        transferRetryMessageEpic(action$, state$, depsMock)
          .pipe(filter(messageSend.request.is))
          .subscribe((a) => {
            requests.push(a);
            action$.next(a);
            // for each message request, emit a success
            action$.next(messageSend.success(undefined, a.meta));
          });

        // expire lock, to init messageSend.request retry loop
        await transferGenerateAndSignEnvelopeMessageEpic(
          of(transferExpire.request(undefined, { secrethash, direction })),
          depsMock.latest$.pipe(pluck('state')),
          depsMock,
        )
          .pipe(tap((a) => action$.next(a)))
          .toPromise();

        // first message request comes right away after transferExpire.success
        expect(requests.length).toBe(1);

        // 1st msg, +2 messages retried after httpTimeout each, then completes
        await new Promise((resolve) => setTimeout(resolve, 500));
        expect(requests.length).toBe(3);
      });
    });

    describe('transferAutoExpireEpic', () => {
      const confirmationBlocks = 2;

      beforeEach(() => action$.next(raidenConfigUpdate({ confirmationBlocks })));

      test("don't emit if transfer didn't expire", async () => {
        expect.assertions(1);

        const promise = transferAutoExpireEpic(action$, state$, depsMock).toPromise();
        action$.next(newBlock({ blockNumber: signedTransfer.lock.expiration.toNumber() - 1 }));
        setTimeout(() => action$.complete(), 10);

        // no output if lock didn't expire yet
        await expect(promise).resolves.toBeUndefined();
      });

      test("don't emit if expired but not confirmed yet", async () => {
        const promise = action$.pipe(toArray()).toPromise();

        transferAutoExpireEpic(action$, state$, depsMock).subscribe((action) => {
          action$.next(action);
          // fail requests, to allow retrying autoExpire on next block
          if (transferExpire.request.is(action))
            action$.next(transferExpire.failure(new Error('signature failed'), action.meta));
        });

        action$.next(
          newBlock({
            blockNumber: signedTransfer.lock.expiration.toNumber() + confirmationBlocks - 1,
          }),
        );
        setTimeout(() => action$.complete(), 10);

        // don't emit even after simple expiration
        await expect(promise).resolves.not.toEqual(
          expect.arrayContaining([transferExpire.request(undefined, { secrethash, direction })]),
        );
      });

      test('expire after confirmed blocks after expiration', async () => {
        const promise = action$.pipe(toArray()).toPromise();

        transferAutoExpireEpic(action$, state$, depsMock).subscribe((action) => {
          action$.next(action);
          // fail requests, to allow retrying autoExpire on next block
          if (transferExpire.request.is(action))
            action$.next(transferExpire.failure(new Error('signature failed'), action.meta));
        });

        action$.next(
          newBlock({
            blockNumber: signedTransfer.lock.expiration.toNumber() + confirmationBlocks + 1,
          }),
        );
        setTimeout(() => action$.complete(), 10);

        // expire after confirmed
        await expect(promise).resolves.toEqual(
          expect.arrayContaining([
            transferExpire.request(undefined, { secrethash, direction }),
            transfer.failure(expect.any(Error), { secrethash, direction }),
          ]),
        );
      });

      test("don't expire if secret registered before expiration", async () => {
        const promise = action$.pipe(toArray()).toPromise();

        transferAutoExpireEpic(action$, state$, depsMock).subscribe((action) => {
          action$.next(action);
          // fail requests, to allow retrying autoExpire on next block
          if (transferExpire.request.is(action))
            action$.next(transferExpire.failure(new Error('signature failed'), action.meta));
        });

        action$.next(
          transferSecretRegister.success(
            {
              secret,
              txHash,
              txBlock: signedTransfer.lock.expiration.toNumber(),
              confirmed: true,
            },
            { secrethash, direction },
          ),
        );
        action$.next(
          newBlock({
            blockNumber: signedTransfer.lock.expiration.toNumber() + confirmationBlocks + 1,
          }),
        );
        setTimeout(() => action$.complete(), 10);

        // expire after confirmed
        await expect(promise).resolves.not.toEqual(
          expect.arrayContaining([transferExpire.request(undefined, { secrethash, direction })]),
        );
      });
    });

    test('monitorSecretRegistryEpic', async () => {
      expect.assertions(3);

      const secrets: transferSecretRegister.success[] = [];

      monitorSecretRegistryEpic(
        EMPTY,
        depsMock.latest$.pipe(pluck('state')),
        depsMock,
      ).subscribe((a) => secrets.push(a));

      // ignore unknown secrethash
      depsMock.provider.emit(
        '*',
        makeLog({
          blockNumber: 127,
          transactionHash: txHash,
          filter: depsMock.secretRegistryContract.filters.SecretRevealed(txHash, null),
          data: HashZero, // non-indexed secret
        }),
      );
      expect(secrets).toHaveLength(0);

      // ignore register after lock expiration block
      depsMock.provider.emit(
        '*',
        makeLog({
          blockNumber: signedTransfer.lock.expiration.toNumber() + 1,
          transactionHash: txHash,
          filter: depsMock.secretRegistryContract.filters.SecretRevealed(secrethash, null),
          data: secret, // non-indexed secret
        }),
      );
      expect(secrets).toHaveLength(0);

      const txBlock = signedTransfer.lock.expiration.toNumber() - 1;
      // valid secrethash,emit
      depsMock.provider.emit(
        '*',
        makeLog({
          blockNumber: txBlock,
          transactionHash: txHash,
          filter: depsMock.secretRegistryContract.filters.SecretRevealed(secrethash, null),
          data: secret, // non-indexed secret
        }),
      );
      expect(secrets).toEqual([
        transferSecretRegister.success(
          { secret, txHash, txBlock, confirmed: undefined },
          { secrethash, direction },
        ),
      ]);
    });

    test('transferSuccessOnSecretRegisteredEpic', async () => {
      const txBlock = 127;

      // don't succeed transfer with unconfirmed action
      await expect(
        transferSuccessOnSecretRegisteredEpic(
          of(
            transferSecretRegister.success(
              { secret, txHash, txBlock, confirmed: undefined },
              { secrethash, direction },
            ),
          ),
        ).toPromise(),
      ).resolves.toBeUndefined();

      // but do with confirmed
      await expect(
        transferSuccessOnSecretRegisteredEpic(
          of(
            transferSecretRegister.success(
              { secret, txHash, txBlock, confirmed: true },
              { secrethash, direction },
            ),
          ),
        ).toPromise(),
      ).resolves.toEqual(transfer.success(expect.anything(), { secrethash, direction }));
    });

    describe('transferProcessedReceivedEpic', () => {
      test('success', async () => {
        const message: Processed = {
            type: MessageType.PROCESSED,
            message_identifier: signedTransfer.message_identifier,
          },
          signed = await signMessage(partnerSigner, message);

        const promise = transferProcessedReceivedEpic(action$, state$).toPromise();
        action$.next(
          messageReceived(
            { text: encodeJsonMessage(signed), message: signed, ts: Date.now() },
            { address: partner },
          ),
        );
        action$.complete();
        await expect(promise).resolves.toEqual(
          transferProcessed({ message: signed }, { secrethash, direction }),
        );
      });

      test('ignore non-Signed(Processed)', async () => {
        const message: Delivered = {
            type: MessageType.DELIVERED,
            delivered_message_identifier: signedTransfer.message_identifier,
          },
          signed = await signMessage(partnerSigner, message);

        const promise = transferProcessedReceivedEpic(action$, state$).toPromise();
        action$.next(
          messageReceived(
            { text: encodeJsonMessage(signed), message: signed, ts: Date.now() },
            { address: partner },
          ),
        );
        action$.complete();

        await expect(promise).resolves.toBeUndefined();
      });

      test('ignore non-matching message_id', async () => {
        const message: Processed = {
            type: MessageType.PROCESSED,
            message_identifier: signedTransfer.payment_identifier,
          },
          signed = await signMessage(partnerSigner, message);

        const promise = transferProcessedReceivedEpic(action$, state$).toPromise();

        action$.next(
          messageReceived(
            { text: encodeJsonMessage(signed), message: signed, ts: Date.now() },
            { address: partner },
          ),
        );
        action$.complete();

        await expect(promise).resolves.toBeUndefined();
      });
    });

    describe('initQueuePendingEnvelopeMessagesEpic', () => {
      test('transferSigned', async () => {
        const promise = initQueuePendingEnvelopeMessagesEpic(
          EMPTY,
          depsMock.latest$.pipe(pluck('state')),
        )
          .pipe(toArray())
          .toPromise();
        action$.complete();

        await expect(promise).resolves.toEqual([
          matrixPresence.request(undefined, { address: partner }),
          transferSigned({ message: signedTransfer, fee, partner }, { secrethash, direction }),
        ]);
      });

      test('transferUnlock.success', async () => {
        const unlocked = await transferGenerateAndSignEnvelopeMessageEpic(
          of(transferUnlock.request(undefined, { secrethash, direction })),
          depsMock.latest$.pipe(pluck('state')),
          depsMock,
        )
          .pipe(tap((a) => action$.next(a)))
          .toPromise();

        const promise = initQueuePendingEnvelopeMessagesEpic(
          EMPTY,
          depsMock.latest$.pipe(pluck('state')),
        )
          .pipe(toArray())
          .toPromise();
        action$.complete();

        await expect(promise).resolves.toEqual(
          expect.arrayContaining([
            matrixPresence.request(undefined, { address: partner }),
            unlocked,
          ]),
        );
      });

      test('transferExpire.success', async () => {
        action$.next(newBlock({ blockNumber: signedTransfer.lock.expiration.toNumber() + 1 }));

        const expired = await transferGenerateAndSignEnvelopeMessageEpic(
          of(transferExpire.request(undefined, { secrethash, direction })),
          depsMock.latest$.pipe(pluck('state')),
          depsMock,
        )
          .pipe(tap((a) => action$.next(a)))
          .toPromise();

        const promise = initQueuePendingEnvelopeMessagesEpic(
          EMPTY,
          depsMock.latest$.pipe(pluck('state')),
        )
          .pipe(toArray())
          .toPromise();
        action$.complete();

        await expect(promise).resolves.toEqual(
          expect.arrayContaining([
            matrixPresence.request(undefined, { address: partner }),
            expired,
          ]),
        );
      });

      test('completed transfer is skipped', async () => {
        action$.next(newBlock({ blockNumber: signedTransfer.lock.expiration.toNumber() + 1 }));

        const expired = await transferGenerateAndSignEnvelopeMessageEpic(
          of(transferExpire.request(undefined, { secrethash, direction })),
          depsMock.latest$.pipe(pluck('state')),
          depsMock,
        )
          .pipe(
            tap((a) => action$.next(a)),
            first(transferExpire.success.is),
          )
          .toPromise();

        const expireProcessed: Processed = {
            type: MessageType.PROCESSED,
            message_identifier: expired.payload.message.message_identifier,
          },
          message = await signMessage(partnerSigner, expireProcessed);

        const promise = initQueuePendingEnvelopeMessagesEpic(EMPTY, state$).toPromise();

        action$.next(transferExpireProcessed({ message }, expired.meta));
        action$.complete();

        await expect(promise).resolves.toBeUndefined();
      });
    });

    describe('transferSecretRequestedEpic', () => {
      test('success', async () => {
        const message: SecretRequest = {
            type: MessageType.SECRET_REQUEST,
            message_identifier: makeMessageId(),
            payment_identifier: signedTransfer.payment_identifier,
            secrethash,
            amount: value,
            expiration: signedTransfer.lock.expiration,
          },
          signed = await signMessage(partnerSigner, message);

        const promise = transferSecretRequestedEpic(action$, state$, depsMock).toPromise();

        action$.next(
          messageReceived(
            { text: encodeJsonMessage(signed), message: signed, ts: Date.now() },
            { address: partner },
          ),
        );
        action$.complete();

        await expect(promise).resolves.toEqual(
          transferSecretRequest({ message: signed }, { secrethash, direction }),
        );
      });

      test('ignore invalid lock', async () => {
        const message: SecretRequest = {
            type: MessageType.SECRET_REQUEST,
            message_identifier: makeMessageId(),
            // wrong payment_identifier
            payment_identifier: signedTransfer.payment_identifier.add(1) as UInt<8>,
            secrethash,
            amount: value,
            expiration: signedTransfer.lock.expiration,
          },
          signed = await signMessage(partnerSigner, message);

        const promise = transferSecretRequestedEpic(action$, state$, depsMock).toPromise();

        action$.next(
          messageReceived(
            { text: encodeJsonMessage(signed), message: signed, ts: Date.now() },
            { address: partner },
          ),
        );
        action$.complete();

        await expect(promise).resolves.toBeUndefined();
      });
    });

    describe('transferSecretRevealEpic', () => {
      test('ignore unknown secrethash', async () => {
        expect.assertions(1);

        const secrethash = txHash;
        const request: SecretRequest = {
          type: MessageType.SECRET_REQUEST,
          message_identifier: makeMessageId(),
          payment_identifier: signedTransfer.payment_identifier,
          secrethash,
          amount: value,
          expiration: signedTransfer.lock.expiration,
        };
        const signed = await signMessage(partnerSigner, request);

        const promise = transferSecretRevealEpic(action$, state$, depsMock)
          .pipe(tap((a) => action$.next(a)))
          .toPromise();

        action$.next(transferSecretRequest({ message: signed }, { secrethash, direction }));
        action$.complete();

        await expect(promise).resolves.toBeUndefined();
      });

      test('ignore expired request', async () => {
        expect.assertions(1);

        const request: SecretRequest = {
          type: MessageType.SECRET_REQUEST,
          message_identifier: makeMessageId(),
          payment_identifier: signedTransfer.payment_identifier,
          secrethash,
          amount: value,
          expiration: One as UInt<32>,
        };
        const signed = await signMessage(partnerSigner, request);

        const promise = transferSecretRevealEpic(action$, state$, depsMock)
          .pipe(tap((a) => action$.next(a)))
          .toPromise();

        action$.next(transferSecretRequest({ message: signed }, { secrethash, direction }));
        action$.complete();

        await expect(promise).resolves.toBeUndefined();
      });

      test('amount too low fails transfer', async () => {
        expect.assertions(1);

        const request: SecretRequest = {
          type: MessageType.SECRET_REQUEST,
          message_identifier: makeMessageId(),
          payment_identifier: signedTransfer.payment_identifier,
          secrethash,
          amount: value.sub(1) as UInt<32>,
          expiration: signedTransfer.lock.expiration,
        };
        const signed = await signMessage(partnerSigner, request);

        const promise = transferSecretRevealEpic(action$, state$, depsMock)
          .pipe(tap((a) => action$.next(a)))
          .toPromise();

        action$.next(transferSecretRequest({ message: signed }, { secrethash, direction }));
        action$.complete();

        await expect(promise).resolves.toEqual(
          transfer.failure(expect.any(Error), { secrethash, direction }),
        );
      });

      test('success and cached', async () => {
        expect.assertions(5);

        const request: SecretRequest = {
            type: MessageType.SECRET_REQUEST,
            message_identifier: makeMessageId(),
            payment_identifier: signedTransfer.payment_identifier,
            secrethash,
            // valid but bigger amount
            amount: value.add(1) as UInt<32>,
            expiration: signedTransfer.lock.expiration,
          },
          signed = await signMessage(partnerSigner, request);

        const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

        transferSecretRevealEpic(action$, state$, depsMock).subscribe((a) => action$.next(a));

        const promise = action$.pipe(takeUntil(timer(10)), toArray()).toPromise();

        action$.next(transferSecretRequest({ message: signed }, { secrethash, direction }));

        await expect(promise).resolves.toEqual(
          expect.arrayContaining([
            transferSecretReveal(
              { message: expect.objectContaining({ type: MessageType.SECRET_REVEAL, secret }) },
              { secrethash, direction },
            ),
            messageSend.request(
              { message: expect.objectContaining({ type: MessageType.SECRET_REVEAL, secret }) },
              { address: partner, msgId: expect.any(String) },
            ),
          ]),
        );
        expect(signerSpy).toHaveBeenCalledTimes(1);

        // expect reveal to be persisted on state
        const reveal = (await depsMock.latest$
          .pipe(pluck('state', 'sent', secrethash, 'secretReveal', '1'), first(isntNil))
          .toPromise()) as Signed<SecretReveal>;
        expect(reveal).toMatchObject({
          type: MessageType.SECRET_REVEAL,
          secret,
          signature: expect.any(String),
        });

        const promise2 = action$.pipe(toArray()).toPromise();

        action$.next(transferSecretRequest({ message: signed }, { secrethash, direction }));
        setTimeout(() => action$.complete(), 10);

        await expect(promise2).resolves.toEqual(
          expect.arrayContaining([
            transferSecretReveal({ message: reveal }, { secrethash, direction }),
          ]),
        );

        // second reveal should have been cached
        expect(signerSpy).toHaveBeenCalledTimes(1);
        signerSpy.mockRestore();
      });
    });

    describe('transferSecretRevealedEpic', () => {
      test('success', async () => {
        expect.assertions(1);

        const reveal: SecretReveal = {
            type: MessageType.SECRET_REVEAL,
            message_identifier: makeMessageId(),
            secret,
          },
          signed = await signMessage(partnerSigner, reveal);

        const promise = transferSecretRevealedEpic(action$, state$).pipe(toArray()).toPromise();

        action$.next(
          messageReceived(
            { text: encodeJsonMessage(signed), message: signed, ts: Date.now() },
            { address: partner },
          ),
        );
        action$.complete();

        await expect(promise).resolves.toEqual(
          expect.arrayContaining([
            transferSecret({ secret }, { secrethash, direction }),
            transferUnlock.request(undefined, { secrethash, direction }),
          ]),
        );
      });

      test('accepts if secret is correct but do not unlock if not from partner', async () => {
        expect.assertions(2);

        const reveal: SecretReveal = {
            type: MessageType.SECRET_REVEAL,
            message_identifier: makeMessageId(),
            secret,
          },
          signed = await signMessage(depsMock.signer, reveal);

        const promise = transferSecretRevealedEpic(action$, state$).pipe(toArray()).toPromise();
        action$.next(
          messageReceived(
            { text: encodeJsonMessage(signed), message: signed, ts: Date.now() },
            { address: depsMock.address },
          ),
        );
        action$.complete();

        const output = await promise;
        // accepts valid/correct secret
        expect(output).toEqual(
          expect.arrayContaining([transferSecret({ secret }, { secrethash, direction })]),
        );
        // but doesn't request unlock, as revealer was not partner
        expect(output).not.toEqual(
          expect.arrayContaining([transferUnlock.request(undefined, expect.anything())]),
        );
      });

      test('ignores if already unlocked', async () => {
        expect.assertions(2);

        await transferGenerateAndSignEnvelopeMessageEpic(
          of(transferUnlock.request(undefined, { secrethash, direction })),
          depsMock.latest$.pipe(pluck('state')),
          depsMock,
        )
          .pipe(tap((action) => action$.next(action)))
          .toPromise();

        // expect unlock to be set
        await expect(
          depsMock.latest$
            .pipe(pluck('state', 'sent', secrethash, 'unlock', '1'), first(isntNil))
            .toPromise(),
        ).resolves.toMatchObject({
          type: MessageType.UNLOCK,
          signature: expect.any(String),
        });

        const reveal: SecretReveal = {
            type: MessageType.SECRET_REVEAL,
            message_identifier: makeMessageId(),
            secret,
          },
          signed = await signMessage(depsMock.signer, reveal);

        const promise = transferSecretRevealedEpic(action$, state$).pipe(toArray()).toPromise();
        action$.next(
          messageReceived(
            { text: encodeJsonMessage(signed), message: signed, ts: Date.now() },
            { address: depsMock.address },
          ),
        );
        action$.complete();

        await expect(promise).resolves.not.toEqual(
          expect.arrayContaining([transferUnlock.request(undefined, expect.anything())]),
        );
      });
    });

    test('transferUnlockProcessedReceivedEpic: success', async () => {
      const unlock = (
        await transferGenerateAndSignEnvelopeMessageEpic(
          of(transferUnlock.request(undefined, { secrethash, direction })),
          depsMock.latest$.pipe(pluck('state')),
          depsMock,
        )
          .pipe(
            tap((action) => action$.next(action)),
            filter(transferUnlock.success.is),
          )
          .toPromise()
      ).payload.message;

      const message: Processed = {
          type: MessageType.PROCESSED,
          message_identifier: unlock.message_identifier,
        },
        signed = await signMessage(partnerSigner, message);

      const promise = transferUnlockProcessedReceivedEpic(action$, state$)
        .pipe(toArray())
        .toPromise();

      action$.next(
        messageReceived(
          { text: encodeJsonMessage(signed), message: signed, ts: Date.now() },
          { address: partner },
        ),
      );
      action$.complete();

      await expect(promise).resolves.toEqual(
        expect.arrayContaining([
          transfer.success(
            {
              balanceProof: expect.objectContaining({
                transferredAmount: unlock.transferred_amount,
              }),
            },
            { secrethash, direction },
          ),
          transferUnlockProcessed(
            { message: expect.objectContaining({ type: MessageType.PROCESSED }) },
            { secrethash, direction },
          ),
        ]),
      );
    });

    describe('transferExpireProcessedEpic', () => {
      let expired: Signed<LockExpired>;

      beforeEach(async () => {
        action$.next(newBlock({ blockNumber: signedTransfer.lock.expiration.toNumber() + 1 }));

        const expiredAction = await transferGenerateAndSignEnvelopeMessageEpic(
          of(transferExpire.request(undefined, { secrethash, direction })),
          depsMock.latest$.pipe(pluck('state')),
          depsMock,
        )
          .pipe(
            tap((a) => action$.next(a)),
            first(transferExpire.success.is),
          )
          .toPromise();

        expired = expiredAction.payload.message;
      });

      test('success', async () => {
        expect.assertions(1);

        const processed: Processed = {
            type: MessageType.PROCESSED,
            message_identifier: expired.message_identifier,
          },
          signed = await signMessage(partnerSigner, processed);

        const promise = transferExpireProcessedEpic(action$, state$).toPromise();
        action$.next(
          messageReceived(
            {
              text: encodeJsonMessage(signed),
              message: signed,
              ts: Date.now(),
            },
            { address: partner },
          ),
        );
        action$.complete();

        await expect(promise).resolves.toEqual(
          transferExpireProcessed({ message: signed }, { secrethash, direction }),
        );
      });

      test('fail sender mismatch', async () => {
        expect.assertions(1);

        const processed: Processed = {
            type: MessageType.PROCESSED,
            message_identifier: expired.message_identifier,
          },
          signed = await signMessage(depsMock.signer, processed);

        const promise = transferExpireProcessedEpic(action$, state$).toPromise();
        action$.next(
          messageReceived(
            {
              text: encodeJsonMessage(signed),
              message: signed,
              ts: Date.now(),
            },
            { address: depsMock.address },
          ),
        );
        action$.complete();

        await expect(promise).resolves.toBeUndefined();
      });
    });

    describe('transferChannelClosedEpic', () => {
      let closeRequest: ActionType<typeof channelClose.request>;
      beforeEach(
        () => (closeRequest = channelClose.request(undefined, { tokenNetwork, partner })),
      );

      test('fail if neither revealed nor unlocked', async () => {
        expect.assertions(1);

        const promise = transferChannelClosedEpic(action$, state$, depsMock)
          .pipe(
            tap((a) => action$.next(a)),
            toArray(),
          )
          .toPromise();

        action$.next(closeRequest);
        action$.complete();

        await expect(promise).resolves.toEqual(
          expect.arrayContaining([transfer.failure(expect.any(Error), { secrethash, direction })]),
        );
      });

      test('success if unlocked', async () => {
        expect.assertions(2);

        transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock).subscribe((a) =>
          action$.next(a),
        );
        action$.next(transferUnlock.request(undefined, { secrethash, direction }));
        // wait for transfer to be unlocked
        await expect(
          depsMock.latest$
            .pipe(pluck('state', 'sent', secrethash, 'unlock'), first(isntNil))
            .toPromise(),
        ).resolves.toBeDefined();

        const promise = transferChannelClosedEpic(action$, state$, depsMock)
          .pipe(toArray())
          .toPromise();

        action$.next(closeRequest);
        action$.complete();

        await expect(promise).resolves.toEqual(
          expect.arrayContaining([
            transfer.success(
              {
                balanceProof: expect.objectContaining({
                  transferredAmount: expect.any(BigNumber),
                }),
              },
              { secrethash, direction },
            ),
          ]),
        );
      });

      test('success if secret revealed', async () => {
        expect.assertions(1);
        const reveal: SecretReveal = {
            type: MessageType.SECRET_REVEAL,
            message_identifier: makeMessageId(),
            secret,
          },
          signed = await signMessage(depsMock.signer, reveal);
        action$.next(transferSecretReveal({ message: signed }, { secrethash, direction }));

        const promise = transferChannelClosedEpic(action$, state$, depsMock)
          .pipe(toArray())
          .toPromise();
        action$.next(closeRequest);
        action$.complete();

        await expect(promise).resolves.toEqual(
          expect.arrayContaining([transfer.success({}, { secrethash, direction })]),
        );
      });

      test('skip different channel', async () => {
        expect.assertions(1);
        const promise = transferChannelClosedEpic(action$, state$, depsMock).toPromise();
        action$.next(channelClose.request(undefined, { tokenNetwork, partner: token }));
        action$.complete();
        await expect(promise).resolves.toBeUndefined();
      });
    });

    describe('RefundTransfer', () => {
      let refund: Signed<RefundTransfer>,
        action: ActionType<typeof messageReceived>,
        otherAction: ActionType<typeof messageReceived>;

      beforeEach(async () => {
        const message: RefundTransfer = {
          type: MessageType.REFUND_TRANSFER,
          chain_id: signedTransfer.chain_id,
          message_identifier: makeMessageId(),
          payment_identifier: signedTransfer.payment_identifier,
          nonce: One as UInt<8>,
          token_network_address: tokenNetwork,
          token,
          recipient: depsMock.address,
          target: depsMock.address,
          initiator: partner,
          channel_identifier: signedTransfer.channel_identifier,
          transferred_amount: Zero as UInt<32>,
          locked_amount: signedTransfer.locked_amount, // "forgot" to decrease locked_amount
          lock: signedTransfer.lock,
          locksroot: signedTransfer.locksroot,
          metadata: { routes: [{ route: [depsMock.address] }] },
        };
        refund = await signMessage(partnerSigner, message);
        action = messageReceived(
          { text: encodeJsonMessage(refund), message: refund, ts: Date.now() },
          { address: partner },
        );
        // a message that won't be processed by this epic
        const other: Delivered = {
            type: MessageType.DELIVERED,
            delivered_message_identifier: refund.message_identifier,
          },
          otherSigned = await signMessage(partnerSigner, other);
        otherAction = messageReceived(
          { text: encodeJsonMessage(otherSigned), message: otherSigned, ts: Date.now() },
          { address: partner },
        );
      });

      test('transferReceivedReplyProcessedEpic', async () => {
        expect.assertions(4);
        const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');
        const promise = transferReceivedReplyProcessedEpic(action$, state$, depsMock)
          .pipe(
            tap((a) => action$.next(a)),
            toArray(),
          )
          .toPromise();

        [action, otherAction, action].forEach((a) => action$.next(a));
        action$.complete();

        const output = await promise;
        expect(output).toHaveLength(2);
        expect(output[0]).toMatchObject({
          type: messageSend.request.type,
          payload: {
            message: expect.objectContaining({
              type: MessageType.PROCESSED,
              message_identifier: refund.message_identifier,
            }),
          },
          meta: { address: partner },
        });
        expect(output[0].payload.message).toBe(output[1].payload.message);
        // second signMessage should have been cached
        expect(signerSpy).toHaveBeenCalledTimes(1);
        signerSpy.mockRestore();
      });

      test('transferRefundedEpic', async () => {
        expect.assertions(2);

        const promise = transferRefundedEpic(action$, state$)
          .pipe(
            tap((a) => action$.next(a)),
            toArray(),
          )
          .toPromise();

        [otherAction, action].forEach((a) => action$.next(a));
        setTimeout(() => action$.complete(), 10);

        // success case
        await expect(promise).resolves.toEqual(
          expect.arrayContaining([
            transferRefunded({ message: refund, partner }, { secrethash, direction }),
            {
              type: transfer.failure.type,
              payload: expect.any(Error),
              error: true,
              meta: { secrethash, direction },
            },
          ]),
        );

        const promise2 = transferRefundedEpic(action$, state$).toPromise();

        action$.next(newBlock({ blockNumber: signedTransfer.lock.expiration.toNumber() + 1 }));
        action$.next(action);
        setTimeout(() => action$.complete(), 10);

        // if transfer expired, refund is ignored
        await expect(promise2).resolves.toBeUndefined();
      });
    });

    describe('withdraw request', () => {
      let partnerDeposit: UInt<32>, transferredAmount: UInt<32>, withdrawableAmount: UInt<32>;

      /* state$ holds the state when a transfer unlocked and completed */
      beforeEach(async () => {
        partnerDeposit = bigNumberify(30) as UInt<32>;
        transferredAmount = value.add(fee) as UInt<32>;
        withdrawableAmount = partnerDeposit.add(transferredAmount) as UInt<32>;

        action$.next(
          channelDeposit.success(
            {
              id: channelId,
              participant: partner,
              totalDeposit: partnerDeposit,
              txHash,
              txBlock: openBlock + 1,
              confirmed: true,
            },
            { tokenNetwork, partner },
          ),
        );
        await transferGenerateAndSignEnvelopeMessageEpic(
          of(transferUnlock.request(undefined, { secrethash, direction })),
          depsMock.latest$.pipe(pluck('state')),
          depsMock,
        )
          .pipe(tap((action) => action$.next(action)))
          .toPromise();
      });

      test('success', async () => {
        expect.assertions(7);

        const request: WithdrawRequest = {
            type: MessageType.WITHDRAW_REQUEST,
            message_identifier: makeMessageId(),
            chain_id: bigNumberify(depsMock.network.chainId) as UInt<32>,
            token_network_address: tokenNetwork,
            channel_identifier: bigNumberify(channelId) as UInt<32>,
            participant: partner,
            // withdrawable amount is partner.deposit + own.g
            total_withdraw: withdrawableAmount,
            nonce: bigNumberify(1) as UInt<8>,
            expiration: bigNumberify(125 + 20) as UInt<32>,
          },
          signed = await signMessage(partnerSigner, request),
          messageReceivedAction = messageReceived(
            { text: encodeJsonMessage(signed), message: signed, ts: Date.now() },
            { address: partner },
          );

        const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

        const withdrawRequestAction = await withdrawRequestReceivedEpic(
          of(messageReceivedAction),
        ).toPromise();

        expect(withdrawRequestAction).toMatchObject({
          type: withdrawReceive.request.type,
          payload: { message: signed },
          meta: {
            tokenNetwork,
            partner,
            totalWithdraw: request.total_withdraw,
            expiration: request.expiration.toNumber(),
          },
        });

        const promise = transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
          .pipe(toArray())
          .toPromise();

        const statePromise = state$.toPromise();
        [withdrawRequestAction, withdrawRequestAction].forEach((a) => action$.next(a));
        setTimeout(() => action$.complete(), 50);

        const output = await promise;
        const state = await statePromise;

        expect(output).toHaveLength(2);
        const payload0 = 'payload' in output[0] && output[0].payload;
        const payload1 = 'payload' in output[1] && output[1].payload;
        expect(payload0 && payload1).toBeTruthy();
        expect(payload0).toEqual(payload1);
        expect(output[0]).toEqual({
          type: withdrawReceive.success.type,
          payload: {
            message: {
              ...request,
              type: MessageType.WITHDRAW_CONFIRMATION,
              message_identifier: expect.any(BigNumber),
              nonce: state.channels[key].own.balanceProof.nonce.add(1),
              signature: expect.any(String),
            },
          },
          meta: withdrawRequestAction.meta,
        });

        const withdrawConfirmationAction = output[0] as ActionType<typeof withdrawReceive.success>;

        await expect(
          withdrawSendConfirmationEpic(of(withdrawConfirmationAction)).toPromise(),
        ).resolves.toMatchObject({
          type: messageSend.request.type,
          payload: { message: withdrawConfirmationAction.payload.message },
          meta: { address: partner },
        });

        // ensure signMessage was cached
        expect(signerSpy).toHaveBeenCalledTimes(1);
        signerSpy.mockRestore();
      });

      test('fail with totalWithdraw larger than partner.deposit + own.g', async () => {
        expect.assertions(1);

        const request: WithdrawRequest = {
            type: MessageType.WITHDRAW_REQUEST,
            message_identifier: makeMessageId(),
            chain_id: bigNumberify(depsMock.network.chainId) as UInt<32>,
            token_network_address: tokenNetwork,
            channel_identifier: bigNumberify(channelId) as UInt<32>,
            participant: partner,
            // withdrawable amount is partner.deposit + own.g
            total_withdraw: withdrawableAmount.add(1) as UInt<32>,
            nonce: bigNumberify(1) as UInt<8>,
            expiration: bigNumberify(125 + 20) as UInt<32>,
          },
          signed = await signMessage(partnerSigner, request),
          messageReceivedAction = messageReceived(
            { text: encodeJsonMessage(signed), message: signed, ts: Date.now() },
            { address: partner },
          );

        withdrawRequestReceivedEpic(action$).subscribe((a) => action$.next(a));
        const promise = transferGenerateAndSignEnvelopeMessageEpic(
          action$,
          state$,
          depsMock,
        ).toPromise();

        action$.next(messageReceivedAction);
        action$.complete();

        await expect(promise).resolves.toBeUndefined();
      });

      test('fail WithdrawRequest expired', async () => {
        expect.assertions(1);

        const request: WithdrawRequest = {
            type: MessageType.WITHDRAW_REQUEST,
            message_identifier: makeMessageId(),
            chain_id: bigNumberify(depsMock.network.chainId) as UInt<32>,
            token_network_address: tokenNetwork,
            channel_identifier: bigNumberify(channelId) as UInt<32>,
            participant: partner,
            // withdrawable amount is partner.deposit + own.g
            total_withdraw: withdrawableAmount,
            nonce: bigNumberify(1) as UInt<8>,
            expiration: bigNumberify(125 + 20) as UInt<32>,
          },
          signed = await signMessage(partnerSigner, request),
          messageReceivedAction = messageReceived(
            { text: encodeJsonMessage(signed), message: signed, ts: Date.now() },
            { address: partner },
          ),
          action = await withdrawRequestReceivedEpic(of(messageReceivedAction)).toPromise();

        action$.next(newBlock({ blockNumber: 125 + 20 + 2 }));

        await expect(
          transferGenerateAndSignEnvelopeMessageEpic(of(action), state$, depsMock).toPromise(),
        ).resolves.toBeUndefined();
      });

      test('fail channel not open', async () => {
        expect.assertions(1);

        const request: WithdrawRequest = {
            type: MessageType.WITHDRAW_REQUEST,
            message_identifier: makeMessageId(),
            chain_id: bigNumberify(depsMock.network.chainId) as UInt<32>,
            token_network_address: tokenNetwork,
            channel_identifier: bigNumberify(channelId) as UInt<32>,
            participant: partner,
            // withdrawable amount is partner.deposit + own.g
            total_withdraw: withdrawableAmount,
            nonce: bigNumberify(1) as UInt<8>,
            expiration: bigNumberify(125 + 20) as UInt<32>,
          },
          signed = await signMessage(partnerSigner, request),
          messageReceivedAction = messageReceived(
            { text: encodeJsonMessage(signed), message: signed, ts: Date.now() },
            { address: partner },
          ),
          action = await withdrawRequestReceivedEpic(of(messageReceivedAction)).toPromise();

        action$.next(channelClose.request(undefined, { tokenNetwork, partner }));

        await expect(
          transferGenerateAndSignEnvelopeMessageEpic(of(action), state$, depsMock).toPromise(),
        ).resolves.toBeUndefined();
      });
    });
  });
});
