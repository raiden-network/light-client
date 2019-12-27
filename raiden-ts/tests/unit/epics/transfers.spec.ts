/* eslint-disable @typescript-eslint/no-explicit-any,@typescript-eslint/camelcase */

import { bigNumberify, BigNumber, keccak256, hexlify, randomBytes } from 'ethers/utils';
import { Zero, HashZero, One } from 'ethers/constants';
import { BehaviorSubject, of, EMPTY, Subject, Observable } from 'rxjs';
import { fakeSchedulers } from 'rxjs-marbles/jest';
import { first, tap, toArray, delay, filter } from 'rxjs/operators';
import { get } from 'lodash';

import {
  newBlock,
  tokenMonitored,
  channelOpen,
  channelDeposit,
  channelClose,
  channelSettle,
} from 'raiden-ts/channels/actions';
import { RaidenAction } from 'raiden-ts/actions';
import { RaidenState } from 'raiden-ts/state';
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
  transferSignedRetryMessageEpic,
  transferUnlockedRetryMessageEpic,
  transferExpiredRetryMessageEpic,
  transferReceivedReplyProcessedEpic,
  transferRefundedEpic,
  withdrawRequestReceivedEpic,
  withdrawSendConfirmationEpic,
} from 'raiden-ts/transfers/epics';
import { matrixPresence } from 'raiden-ts/transport/actions';
import { raidenReducer } from 'raiden-ts/reducer';
import { UInt, Address, Hash, Signed } from 'raiden-ts/utils/types';
import { isActionOf, ActionType } from 'raiden-ts/utils/actions';
import { makeMessageId, makeSecret, getSecrethash } from 'raiden-ts/transfers/utils';

import { epicFixtures } from '../fixtures';
import { raidenEpicDeps } from '../mocks';
import { getLatest$ } from 'raiden-ts/epics';

describe('transfers epic', () => {
  let depsMock = raidenEpicDeps();
  let {
    token,
    tokenNetwork,
    channelId,
    partner,
    settleTimeout,
    isFirstParticipant,
    txHash,
    state,
    matrixServer,
    partnerUserId,
    partnerSigner,
    paymentId,
    fee,
    paths,
  } = epicFixtures(depsMock);

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
      state,
      matrixServer,
      partnerUserId,
      partnerSigner,
      paymentId,
      fee,
      paths,
    } = epicFixtures(depsMock));
  });

  afterEach(() => {
    jest.clearAllMocks();
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
        otherDeposit = bigNumberify(800) as UInt<32>,
        action$ = of(
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
            { secrethash },
          ),
          // double transfer to test caching
          transfer.request(
            { tokenNetwork, target: partner, value, paths, paymentId },
            { secrethash },
          ),
        ),
        state$ = new BehaviorSubject(
          [
            tokenMonitored({ token, tokenNetwork, fromBlock: 1 }),
            // a couple of channels with unrelated partners, with larger deposits
            channelOpen.success(
              { id: channelId - 2, settleTimeout, openBlock, isFirstParticipant, txHash },
              { tokenNetwork, partner: otherPartner2 },
            ),
            channelDeposit.success(
              {
                id: channelId - 2,
                participant: depsMock.address,
                totalDeposit: otherDeposit,
                txHash,
              },
              { tokenNetwork, partner: otherPartner2 },
            ),
            channelOpen.success(
              { id: channelId - 1, settleTimeout, openBlock, isFirstParticipant, txHash },
              { tokenNetwork, partner: otherPartner1 },
            ),
            channelDeposit.success(
              {
                id: channelId - 1,
                participant: depsMock.address,
                totalDeposit: otherDeposit,
                txHash,
              },
              { tokenNetwork, partner: otherPartner1 },
            ),
            // but transfer should prefer this direct channel
            channelOpen.success(
              { id: channelId, settleTimeout, openBlock, isFirstParticipant, txHash },
              { tokenNetwork, partner },
            ),
            channelDeposit.success(
              {
                id: channelId,
                participant: depsMock.address,
                totalDeposit: bigNumberify(500) as UInt<32>,
                txHash,
              },
              { tokenNetwork, partner },
            ),
            newBlock({ blockNumber: 125 }),
          ].reduce(raidenReducer, state),
        );

      getLatest$(action$, state$).subscribe(depsMock.latest$);

      const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

      const output = await transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
        .pipe(
          tap(action => state$.next(raidenReducer(state$.value, action))),
          toArray(),
        )
        .toPromise();

      expect(output).toEqual(
        expect.arrayContaining([
          {
            type: transferSecret.type,
            payload: { secret },
            meta: { secrethash },
          },
          {
            type: transferSigned.type,
            payload: {
              message: expect.objectContaining({
                type: MessageType.LOCKED_TRANSFER,
                message_identifier: expect.any(BigNumber),
                signature: expect.any(String),
              }),
              fee,
            },
            meta: { secrethash },
          },
        ]),
      );

      // second transfer should have been cached
      expect(signerSpy).toHaveBeenCalledTimes(1);
      signerSpy.mockRestore();
    });

    test('transferSigned fail no channel with route partner', async () => {
      expect.assertions(1);

      const closingPartner = '0x0100000000000000000000000000000000000000' as Address,
        action$ = of(
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
            { secrethash },
          ),
        ),
        state$ = of(
          [
            tokenMonitored({ token, tokenNetwork, fromBlock: 1 }),
            // channel with closingPartner: closed
            channelOpen.success(
              { id: channelId + 1, settleTimeout, openBlock, isFirstParticipant, txHash },
              { tokenNetwork, partner: closingPartner },
            ),
            channelClose.success(
              {
                id: channelId + 1,
                participant: closingPartner,
                closeBlock: openBlock + 1,
                txHash,
              },
              { tokenNetwork, partner: closingPartner },
            ),
            newBlock({ blockNumber: 125 }),
          ].reduce(raidenReducer, state),
        );

      getLatest$(action$, state$).subscribe(depsMock.latest$);

      await expect(
        transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
          .pipe(first())
          .toPromise(),
      ).resolves.toMatchObject({
        type: transfer.failure.type,
        payload: expect.any(Error),
        error: true,
        meta: { secrethash },
      });
    });
  });

  describe('transfer: epics depending on pending transfer', () => {
    const secret = makeSecret(),
      secrethash = getSecrethash(secret),
      value = bigNumberify(10) as UInt<32>,
      openBlock = 121;

    let transferingState: RaidenState, signedTransfer: Signed<LockedTransfer>;

    /**
     * this will leave/reset transferingState, signedTransfer as a state with a channel and pending
     * transfer
     */
    beforeEach(async () => {
      const action$: Observable<RaidenAction> = of(
          matrixPresence.success(
            { userId: partnerUserId, available: true, ts: Date.now() },
            { address: partner },
          ),
          transfer.request(
            { tokenNetwork, target: partner, value, secret, paths, paymentId },
            { secrethash },
          ),
        ),
        state$ = new BehaviorSubject(
          [
            tokenMonitored({ token, tokenNetwork, fromBlock: 1 }),
            channelOpen.success(
              { id: channelId, settleTimeout, openBlock, isFirstParticipant, txHash },
              { tokenNetwork, partner },
            ),
            channelDeposit.success(
              {
                id: channelId,
                participant: depsMock.address,
                totalDeposit: bigNumberify(500) as UInt<32>,
                txHash,
              },
              { tokenNetwork, partner },
            ),
            newBlock({ blockNumber: 125 }),
          ].reduce(raidenReducer, state),
        );

      getLatest$(action$, state$).subscribe(depsMock.latest$);

      const output = await transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
        .pipe(toArray())
        .toPromise();
      for (const action of output) {
        if (isActionOf(transferSigned, action)) {
          signedTransfer = action.payload.message;
        }
      }

      state$.next([...output, newBlock({ blockNumber: 126 })].reduce(raidenReducer, state$.value));
      transferingState = state$.value;
    });

    describe('transferUnlock.request', () => {
      test('success and cached', async () => {
        expect.assertions(2);

        // secret revealed action is only ever emitted when received from recipient
        const action$ = of(
            transferUnlock.request(undefined, { secrethash }),
            transferUnlock.request(undefined, { secrethash }),
          ),
          state$ = new BehaviorSubject(transferingState);

        getLatest$(action$, state$).subscribe(depsMock.latest$);

        const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

        await expect(
          transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
            .pipe(
              tap(action => state$.next(raidenReducer(state$.value, action))),
              toArray(),
            )
            .toPromise(),
        ).resolves.toEqual(
          expect.arrayContaining([
            {
              type: transferUnlock.success.type,
              payload: {
                message: expect.objectContaining({
                  type: MessageType.UNLOCK,
                  locksroot: keccak256([]),
                  transferred_amount: value.add(fee),
                  locked_amount: Zero,
                  message_identifier: expect.any(BigNumber),
                  signature: expect.any(String),
                }),
              },
              meta: { secrethash },
            },
          ]),
        );

        expect(signerSpy).toHaveBeenCalledTimes(1);
        signerSpy.mockRestore();
      });

      test('fail channel gone', async () => {
        expect.assertions(2);

        // update state: transfer still pending, but channel gets settled
        const closeBlock = 125,
          action$ = of(transferUnlock.request(undefined, { secrethash })),
          state$ = of(
            [
              channelClose.success(
                { id: channelId, participant: partner, closeBlock, txHash },
                { tokenNetwork, partner },
              ),
              newBlock({ blockNumber: closeBlock + settleTimeout + 1 }),
              channelSettle.success(
                { id: channelId, settleBlock: closeBlock + settleTimeout + 1, txHash },
                { tokenNetwork, partner },
              ),
              newBlock({ blockNumber: closeBlock + settleTimeout + 2 }),
            ].reduce(raidenReducer, transferingState),
          );

        getLatest$(action$, state$).subscribe(depsMock.latest$);

        const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

        await expect(
          transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
            .pipe(toArray())
            .toPromise(),
        ).resolves.toEqual(
          expect.not.arrayContaining([
            expect.objectContaining({ type: transferUnlock.success.type, meta: { secrethash } }),
          ]),
        );

        // unlock shouldn't be called and signed
        expect(signerSpy).toHaveBeenCalledTimes(0);
        signerSpy.mockRestore();
      });

      test('fail channel closed', async () => {
        expect.assertions(2);

        // secret revealed action is only ever emitted when received from recipient
        const closeBlock = 125,
          action$ = of(transferUnlock.request(undefined, { secrethash })),
          state$ = of(
            [
              channelClose.success(
                { id: channelId, participant: partner, closeBlock, txHash },
                { tokenNetwork, partner },
              ),
            ].reduce(raidenReducer, transferingState),
          );

        getLatest$(action$, state$).subscribe(depsMock.latest$);

        const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

        await expect(
          transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
            .pipe(toArray())
            .toPromise(),
        ).resolves.toEqual(
          expect.not.arrayContaining([
            expect.objectContaining({ type: transferUnlock.success.type, meta: { secrethash } }),
          ]),
        );

        // unlock shouldn't be called and signed
        expect(signerSpy).toHaveBeenCalledTimes(0);
        signerSpy.mockRestore();
      });

      test('fail lock expired', async () => {
        expect.assertions(2);

        // secret revealed action is only ever emitted when received from recipient
        const action$ = of(transferUnlock.request(undefined, { secrethash })),
          state$ = of(
            [newBlock({ blockNumber: signedTransfer.lock.expiration.toNumber() + 1 })].reduce(
              raidenReducer,
              transferingState,
            ),
          );

        getLatest$(action$, state$).subscribe(depsMock.latest$);

        const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

        await expect(
          transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
            .pipe(toArray())
            .toPromise(),
        ).resolves.toEqual(
          expect.not.arrayContaining([
            expect.objectContaining({ type: transferUnlock.success.type, meta: { secrethash } }),
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
        const action$ = of(
            transferExpire.request(undefined, { secrethash }),
            transferExpire.request(undefined, { secrethash }),
          ),
          state$ = new BehaviorSubject(
            [newBlock({ blockNumber: signedTransfer.lock.expiration.toNumber() + 1 })].reduce(
              raidenReducer,
              transferingState,
            ),
          );
        getLatest$(action$, state$).subscribe(depsMock.latest$);

        const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

        await expect(
          transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
            .pipe(
              tap(action => state$.next(raidenReducer(state$.value, action))),
              toArray(),
            )
            .toPromise(),
        ).resolves.toEqual(
          expect.arrayContaining([
            {
              type: transferExpire.success.type,
              payload: {
                message: expect.objectContaining({
                  type: MessageType.LOCK_EXPIRED,
                  locksroot: keccak256([]),
                  transferred_amount: Zero,
                  locked_amount: Zero,
                  message_identifier: expect.any(BigNumber),
                  signature: expect.any(String),
                }),
              },
              meta: { secrethash },
            },
          ]),
        );

        expect(signerSpy).toHaveBeenCalledTimes(1);
        signerSpy.mockRestore();
      });

      test('fail channel closed', async () => {
        expect.assertions(2);

        // secret revealed action is only ever emitted when received from recipient
        const closeBlock = 125,
          action$ = of(transferExpire.request(undefined, { secrethash })),
          state$ = of(
            [
              channelClose.success(
                { id: channelId, participant: partner, closeBlock, txHash },
                { tokenNetwork, partner },
              ),
              newBlock({ blockNumber: signedTransfer.lock.expiration.toNumber() + 1 }),
            ].reduce(raidenReducer, transferingState),
          );
        getLatest$(action$, state$).subscribe(depsMock.latest$);

        const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

        await expect(
          transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
            .pipe(toArray())
            .toPromise(),
        ).resolves.toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: transferExpire.failure.type,
              payload: expect.any(Error),
              meta: { secrethash },
            }),
          ]),
        );

        // unlock shouldn't be called and signed
        expect(signerSpy).toHaveBeenCalledTimes(0);
        signerSpy.mockRestore();
      });

      test('fail lock not expired yet', async () => {
        expect.assertions(2);

        // secret revealed action is only ever emitted when received from recipient
        const action$ = of(transferExpire.request(undefined, { secrethash })),
          state$ = of(
            [newBlock({ blockNumber: signedTransfer.lock.expiration.toNumber() - 1 })].reduce(
              raidenReducer,
              transferingState,
            ),
          );

        const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

        await expect(
          transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
            .pipe(toArray())
            .toPromise(),
        ).resolves.toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: transferExpire.failure.type,
              payload: expect.any(Error),
              meta: { secrethash },
            }),
          ]),
        );

        // unlock shouldn't be called and signed
        expect(signerSpy).toHaveBeenCalledTimes(0);
        signerSpy.mockRestore();
      });

      test('fail transfer gone', async () => {
        expect.assertions(2);

        // secret revealed action is only ever emitted when received from recipient
        const action$ = of(
            transferExpire.request(undefined, {
              secrethash: HashZero as Hash /* no transfer with HashZero as secrethash */,
            }),
          ),
          state$ = of(
            [newBlock({ blockNumber: signedTransfer.lock.expiration.toNumber() + 1 })].reduce(
              raidenReducer,
              transferingState,
            ),
          );

        const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

        await expect(
          transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
            .pipe(toArray())
            .toPromise(),
        ).resolves.toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: transferExpire.failure.type,
              payload: expect.any(Error),
              meta: { secrethash: HashZero },
            }),
          ]),
        );

        // unlock shouldn't be called and signed
        expect(signerSpy).toHaveBeenCalledTimes(0);
        signerSpy.mockRestore();
      });

      test('fail transfer unlocked', async () => {
        expect.assertions(3);

        const state$ = new BehaviorSubject(transferingState);

        await transferGenerateAndSignEnvelopeMessageEpic(
          of(transferUnlock.request(undefined, { secrethash })),
          state$,
          depsMock,
        )
          .pipe(tap(action => state$.next(raidenReducer(state$.value, action))))
          .toPromise();

        // expect unlock to be set
        expect(get(state$.value, ['sent', secrethash, 'unlock', 1])).toMatchObject({
          type: MessageType.UNLOCK,
          signature: expect.any(String),
        });

        state$.next(
          [newBlock({ blockNumber: signedTransfer.lock.expiration.toNumber() + 1 })].reduce(
            raidenReducer,
            state$.value,
          ),
        );

        const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');
        const action$ = of(transferExpire.request(undefined, { secrethash }));

        await expect(
          transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
            .pipe(toArray())
            .toPromise(),
        ).resolves.toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: transferExpire.failure.type,
              payload: expect.any(Error),
              meta: { secrethash },
            }),
          ]),
        );

        // unlock shouldn't be called and signed
        expect(signerSpy).toHaveBeenCalledTimes(0);
        signerSpy.mockRestore();
      });
    });

    describe('transfer*RetryMessageEpic', () => {
      let processed: Signed<Processed>,
        unlockedAction: ActionType<typeof transferUnlock.success>,
        unlockProcessed: Signed<Processed>,
        expiredAction: ActionType<typeof transferExpire.success>,
        expiredProcessed: Signed<Processed>;

      beforeEach(async () => {
        jest.useFakeTimers();

        const msg: Processed = {
          type: MessageType.PROCESSED,
          message_identifier: signedTransfer.message_identifier,
        };
        processed = await signMessage(partnerSigner, msg);

        // set state as unlocked
        const a = await transferGenerateAndSignEnvelopeMessageEpic(
          of(transferUnlock.request(undefined, { secrethash })),
          of(transferingState),
          depsMock,
        ).toPromise();

        if (!a || !isActionOf(transferUnlock.success, a)) throw new Error(`not unlocked: ${a}`);
        unlockedAction = a;
        unlockProcessed = await signMessage(partnerSigner, {
          type: MessageType.PROCESSED,
          message_identifier: unlockedAction.payload.message.message_identifier,
        });

        // set state as unlocked
        const expiredState = raidenReducer(
          transferingState,
          newBlock({ blockNumber: signedTransfer.lock.expiration.toNumber() + 1 }),
        );

        depsMock.latest$.pipe(first()).subscribe(l => {
          depsMock.latest$.next({ ...l, state: expiredState });
        });

        const b = await transferGenerateAndSignEnvelopeMessageEpic(
          of(transferExpire.request(undefined, { secrethash })),
          of(expiredState),
          depsMock,
        ).toPromise();

        if (!b || !isActionOf(transferExpire.success, b)) throw new Error(`not expired`);
        expiredAction = b;
        expiredProcessed = await signMessage(partnerSigner, {
          type: MessageType.PROCESSED,
          message_identifier: expiredAction.payload.message.message_identifier,
        });
      });

      test(
        'transferSigned',
        fakeSchedulers(advance => {
          expect.assertions(3);

          const state$ = new BehaviorSubject<RaidenState>(transferingState),
            // 'of' is cold and'll fire these events on every subscription. For inner observable,
            // only messageSend.success is relevant and'll confirm messageSend.request with message=signedTransfer
            action$ = of(
              transferSigned({ message: signedTransfer, fee }, { secrethash }),
              messageSend.success(undefined, {
                address: partner,
                msgId: signedTransfer.message_identifier.toString(),
              }),
            );

          depsMock.latest$.pipe(first()).subscribe(l => {
            depsMock.latest$.next({ ...l, state: transferingState });
          });

          let sent = 0;
          transferSignedRetryMessageEpic(action$, state$, depsMock).subscribe(() => sent++);

          // first messageSend.request is sent immediatelly
          advance(1);
          expect(sent).toBe(1);

          // advance 80s, 10s each; somehow advance(80e3) doesn't do all callbacks as expected
          for (let t = 0; t < 80; t += 10) advance(10e3);
          // then, at 30 and 60s, 2 more retries
          expect(sent).toBe(3);

          const processedState = raidenReducer(
            state$.value,
            transferProcessed({ message: processed }, { secrethash }),
          );
          state$.next(processedState);
          depsMock.latest$.pipe(first()).subscribe(l => {
            depsMock.latest$.next({ ...l, state: processedState });
          });

          // +30s and no new messageSend.request, as transferProcessed stopped retry
          for (let t = 0; t < 30; t += 10) advance(10e3);
          expect(sent).toBe(3);
        }),
      );

      test(
        'transferUnlock.success',
        fakeSchedulers(advance => {
          expect.assertions(3);

          const state$ = new BehaviorSubject<RaidenState>(
            raidenReducer(transferingState, unlockedAction),
          );

          // 'of' is cold and'll fire these events on every subscription. For inner observable,
          // only messageSend.success is relevant and will confirm messageSend.request with message=signedTransfer
          const action$ = of(
            unlockedAction,
            messageSend.success(undefined, {
              address: partner,
              msgId: unlockedAction.payload.message.message_identifier.toString(),
            }),
          ).pipe(delay(1));

          let sent = 0;
          transferUnlockedRetryMessageEpic(action$, state$, depsMock).subscribe(() => sent++);

          // first messageSend.request is sent immediatelly
          advance(1);
          expect(sent).toBe(1);

          // advance 80s, 10s each; somehow advance(80e3) doesn't do all callbacks as expected
          for (let t = 0; t < 80; t += 10) advance(10e3);
          // then, at 30 and 60s, 2 more retries
          expect(sent).toBe(3);

          // clear transfer from state
          state$.next(
            raidenReducer(
              state$.value,
              transferUnlockProcessed({ message: unlockProcessed }, { secrethash }),
            ),
          );

          // +30s and no new messageSend.request, as transferUnlockProcessed stopped retry
          for (let t = 0; t < 30; t += 10) advance(10e3);
          expect(sent).toBe(3);
        }),
      );

      test(
        'transferExpire.success',
        fakeSchedulers(advance => {
          expect.assertions(3);

          const state$ = new BehaviorSubject<RaidenState>(
            [
              newBlock({ blockNumber: signedTransfer.lock.expiration.toNumber() + 1 }),
              expiredAction,
            ].reduce(raidenReducer, transferingState),
          );

          // 'of' is cold and'll fire these events on every subscription. For inner observable,
          // only messageSend.success is relevant and will confirm messageSend.request with message=signedTransfer
          const action$ = of(
            expiredAction,
            messageSend.success(undefined, {
              address: partner,
              msgId: expiredAction.payload.message.message_identifier.toString(),
            }),
          ).pipe(delay(1));

          let sent = 0;
          transferExpiredRetryMessageEpic(action$, state$, depsMock).subscribe(() => sent++);

          // first messageSend.request is sent immediatelly
          advance(1);
          expect(sent).toBe(1);

          // advance 80s, 10s each; somehow advance(80e3) doesn't do all callbacks as expected
          for (let t = 0; t < 80; t += 10) advance(10e3);
          // then, at 30 and 60s, 2 more retries
          expect(sent).toBe(3);

          // clear transfer from state
          state$.next(
            raidenReducer(
              state$.value,
              transferExpireProcessed({ message: expiredProcessed }, { secrethash }),
            ),
          );

          // +30s and no new messageSend.request, as transferExpireProcessed stopped retry
          for (let t = 0; t < 30; t += 10) advance(10e3);
          expect(sent).toBe(3);
        }),
      );
    });

    test('transferAutoExpireEpic', async () => {
      expect.assertions(2);

      const state$ = new BehaviorSubject(transferingState);

      // no output if lock didn't expire yet
      await expect(
        transferAutoExpireEpic(
          of(newBlock({ blockNumber: signedTransfer.lock.expiration.toNumber() - 1 })),
          state$,
        ).toPromise(),
      ).resolves.toBeUndefined();

      const action$ = new Subject<RaidenAction>();
      const promise = transferAutoExpireEpic(action$, state$)
        .pipe(
          tap(action => {
            if (isActionOf(transferExpire.request, action)) {
              transferGenerateAndSignEnvelopeMessageEpic(of(action), state$, depsMock).subscribe(
                expired => {
                  // push state when transferExpire.success
                  state$.next(raidenReducer(state$.value, expired));
                  // also push to input action$, to complete pending inner$ in exhaustMap
                  action$.next(expired);
                  // and complete, as no other newBlock/transferExpire.request[d|Failed] will go through
                  action$.complete();
                },
              );
            }
          }),
          toArray(),
        )
        .toPromise();

      const action = newBlock({ blockNumber: signedTransfer.lock.expiration.toNumber() + 1 });
      state$.next(raidenReducer(state$.value, action));
      action$.next(action);

      await expect(promise).resolves.toEqual(
        expect.arrayContaining([
          {
            type: transferExpire.request.type,
            payload: undefined,
            meta: { secrethash },
          },
          {
            type: transfer.failure.type,
            payload: expect.any(Error),
            error: true,
            meta: { secrethash },
          },
        ]),
      );
    });

    describe('transferProcessedReceivedEpic', () => {
      test('success', async () => {
        const message: Processed = {
            type: MessageType.PROCESSED,
            message_identifier: signedTransfer.message_identifier,
          },
          signed = await signMessage(partnerSigner, message),
          action$ = of(
            messageReceived(
              { text: encodeJsonMessage(signed), message: signed, ts: Date.now() },
              { address: partner },
            ),
          ),
          state$ = of(transferingState);

        await expect(transferProcessedReceivedEpic(action$, state$).toPromise()).resolves.toEqual(
          transferProcessed({ message: signed }, { secrethash }),
        );
      });

      test('ignore non-Signed(Processed)', async () => {
        const message: Delivered = {
            type: MessageType.DELIVERED,
            delivered_message_identifier: signedTransfer.message_identifier,
          },
          signed = await signMessage(partnerSigner, message),
          action$ = of(
            messageReceived(
              { text: encodeJsonMessage(signed), message: signed, ts: Date.now() },
              { address: partner },
            ),
          ),
          state$ = of(transferingState);

        await expect(
          transferProcessedReceivedEpic(action$, state$).toPromise(),
        ).resolves.toBeUndefined();
      });

      test('ignore non-matching message_id', async () => {
        const message: Processed = {
            type: MessageType.PROCESSED,
            message_identifier: signedTransfer.payment_identifier,
          },
          signed = await signMessage(partnerSigner, message),
          action$ = of(
            messageReceived(
              { text: encodeJsonMessage(signed), message: signed, ts: Date.now() },
              { address: partner },
            ),
          ),
          state$ = of(transferingState);

        await expect(
          transferProcessedReceivedEpic(action$, state$).toPromise(),
        ).resolves.toBeUndefined();
      });
    });

    describe('initQueuePendingEnvelopeMessagesEpic', () => {
      test('transferSigned', async () => {
        const state$ = of(transferingState);
        await expect(
          initQueuePendingEnvelopeMessagesEpic(EMPTY, state$)
            .pipe(toArray())
            .toPromise(),
        ).resolves.toEqual([
          matrixPresence.request(undefined, { address: partner }),
          transferSigned({ message: signedTransfer, fee }, { secrethash }),
        ]);
      });

      test('transferUnlock.success', async () => {
        const state$ = new BehaviorSubject(transferingState),
          unlocked = await transferGenerateAndSignEnvelopeMessageEpic(
            of(transferUnlock.request(undefined, { secrethash })),
            state$,
            depsMock,
          ).toPromise();

        state$.next(raidenReducer(state$.value, unlocked));

        await expect(
          initQueuePendingEnvelopeMessagesEpic(EMPTY, state$)
            .pipe(toArray())
            .toPromise(),
        ).resolves.toEqual(
          expect.arrayContaining([
            matrixPresence.request(undefined, { address: partner }),
            unlocked,
          ]),
        );
      });

      test('transferExpire.success', async () => {
        const expiredState = raidenReducer(
          transferingState,
          newBlock({ blockNumber: signedTransfer.lock.expiration.toNumber() + 1 }),
        );

        const state$ = new BehaviorSubject(expiredState);

        depsMock.latest$.pipe(first()).subscribe(l => {
          depsMock.latest$.next({ ...l, state: expiredState });
        });

        const expired = await transferGenerateAndSignEnvelopeMessageEpic(
          of(transferExpire.request(undefined, { secrethash })),
          state$,
          depsMock,
        ).toPromise();

        state$.next(raidenReducer(state$.value, expired));

        await expect(
          initQueuePendingEnvelopeMessagesEpic(EMPTY, state$)
            .pipe(toArray())
            .toPromise(),
        ).resolves.toEqual(
          expect.arrayContaining([
            matrixPresence.request(undefined, { address: partner }),
            expired,
          ]),
        );
      });

      test('completed transfer is skipped', async () => {
        const expiredState = raidenReducer(
          transferingState,
          newBlock({ blockNumber: signedTransfer.lock.expiration.toNumber() + 1 }),
        );

        const state$ = new BehaviorSubject(expiredState);

        depsMock.latest$.pipe(first()).subscribe(l => {
          depsMock.latest$.next({ ...l, state: expiredState });
        });

        const expired = await transferGenerateAndSignEnvelopeMessageEpic(
          of(transferExpire.request(undefined, { secrethash })),
          state$,
          depsMock,
        ).toPromise();

        // narrow down type of expired
        if (!isActionOf(transferExpire.success, expired)) throw new Error('not expired');

        const expireProcessed: Processed = {
            type: MessageType.PROCESSED,
            message_identifier: expired.payload.message.message_identifier,
          },
          message = await signMessage(partnerSigner, expireProcessed);

        state$.next(
          [expired, transferExpireProcessed({ message }, expired.meta)].reduce(
            raidenReducer,
            state$.value,
          ),
        );

        await expect(
          initQueuePendingEnvelopeMessagesEpic(EMPTY, state$).toPromise(),
        ).resolves.toBeUndefined();
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
          signed = await signMessage(partnerSigner, message),
          action$ = of(
            messageReceived(
              { text: encodeJsonMessage(signed), message: signed, ts: Date.now() },
              { address: partner },
            ),
          ),
          state$ = of(transferingState);

        await expect(transferSecretRequestedEpic(action$, state$).toPromise()).resolves.toEqual(
          transferSecretRequest({ message: signed }, { secrethash }),
        );
      });

      test('ignore invalid lock', async () => {
        const message: SecretRequest = {
            type: MessageType.SECRET_REQUEST,
            message_identifier: makeMessageId(),
            payment_identifier: signedTransfer.payment_identifier,
            secrethash,
            amount: value,
            expiration: value, // invalid expiration
          },
          signed = await signMessage(partnerSigner, message),
          action$ = of(
            messageReceived(
              { text: encodeJsonMessage(signed), message: signed, ts: Date.now() },
              { address: partner },
            ),
          ),
          state$ = of(transferingState);

        await expect(
          transferSecretRequestedEpic(action$, state$).toPromise(),
        ).resolves.toBeUndefined();
      });
    });

    test('transferSecretRevealEpic: success and cached', async () => {
      expect.assertions(4);

      const request: SecretRequest = {
          type: MessageType.SECRET_REQUEST,
          message_identifier: makeMessageId(),
          payment_identifier: signedTransfer.payment_identifier,
          secrethash,
          amount: value,
          expiration: signedTransfer.lock.expiration,
        },
        signed = await signMessage(partnerSigner, request),
        action$ = of(transferSecretRequest({ message: signed }, { secrethash })),
        state$ = new BehaviorSubject<RaidenState>(transferingState);

      getLatest$(action$, state$).subscribe(depsMock.latest$);

      const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

      await expect(
        transferSecretRevealEpic(action$, state$, depsMock)
          .pipe(
            tap(action => state$.next(raidenReducer(state$.value, action))),
            toArray(),
          )
          .toPromise(),
      ).resolves.toEqual(
        expect.arrayContaining([
          {
            type: transferSecretReveal.type,
            payload: {
              message: expect.objectContaining({ type: MessageType.SECRET_REVEAL, secret }),
            },
            meta: { secrethash },
          },
          {
            type: messageSend.request.type,
            payload: {
              message: expect.objectContaining({ type: MessageType.SECRET_REVEAL, secret }),
            },
            meta: { address: partner, msgId: expect.any(String) },
          },
        ]),
      );

      // expect reveal to be persisted on state
      const reveal = get(state$.value, ['sent', secrethash, 'secretReveal', 1]);
      expect(reveal).toMatchObject({
        type: MessageType.SECRET_REVEAL,
        secret,
        signature: expect.any(String),
      });

      await expect(
        transferSecretRevealEpic(action$, state$, depsMock)
          .pipe(
            tap(action => state$.next(raidenReducer(state$.value, action))),
            filter(isActionOf(transferSecretReveal)),
          )
          .toPromise(),
      ).resolves.toMatchObject({
        type: transferSecretReveal.type,
        payload: { message: reveal },
        meta: { secrethash },
      });

      // second reveal should have been cached
      expect(signerSpy).toHaveBeenCalledTimes(1);
      signerSpy.mockRestore();
    });

    describe('transferSecretRevealedEpic', () => {
      test('success', async () => {
        expect.assertions(1);

        const reveal: SecretReveal = {
            type: MessageType.SECRET_REVEAL,
            message_identifier: makeMessageId(),
            secret,
          },
          signed = await signMessage(partnerSigner, reveal),
          action$ = of(
            messageReceived(
              { text: encodeJsonMessage(signed), message: signed, ts: Date.now() },
              { address: partner },
            ),
          ),
          state$ = of(transferingState);

        await expect(
          transferSecretRevealedEpic(action$, state$)
            .pipe(toArray())
            .toPromise(),
        ).resolves.toEqual(
          expect.arrayContaining([
            transferSecret({ secret }, { secrethash }),
            transferUnlock.request(undefined, { secrethash }),
          ]),
        );
      });

      test('ignores if not from recipient/neighbor', async () => {
        expect.assertions(1);

        const reveal: SecretReveal = {
            type: MessageType.SECRET_REVEAL,
            message_identifier: makeMessageId(),
            secret,
          },
          signed = await signMessage(depsMock.signer, reveal),
          action$ = of(
            messageReceived(
              { text: encodeJsonMessage(signed), message: signed, ts: Date.now() },
              { address: depsMock.address },
            ),
          ),
          state$ = of(transferingState);

        await expect(
          transferSecretRevealedEpic(action$, state$).toPromise(),
        ).resolves.toBeUndefined();
      });

      test('ignores if already unlocked', async () => {
        expect.assertions(2);

        const state$ = new BehaviorSubject(transferingState);

        await transferGenerateAndSignEnvelopeMessageEpic(
          of(transferUnlock.request(undefined, { secrethash })),
          state$,
          depsMock,
        )
          .pipe(tap(action => state$.next(raidenReducer(state$.value, action))))
          .toPromise();

        // expect unlock to be set
        expect(get(state$.value, ['sent', secrethash, 'unlock', 1])).toMatchObject({
          type: MessageType.UNLOCK,
          signature: expect.any(String),
        });

        const reveal: SecretReveal = {
            type: MessageType.SECRET_REVEAL,
            message_identifier: makeMessageId(),
            secret,
          },
          signed = await signMessage(depsMock.signer, reveal),
          action$ = of(
            messageReceived(
              { text: encodeJsonMessage(signed), message: signed, ts: Date.now() },
              { address: depsMock.address },
            ),
          );

        await expect(
          transferSecretRevealedEpic(action$, state$).toPromise(),
        ).resolves.toBeUndefined();
      });
    });

    test('transferUnlockProcessedReceivedEpic: success', async () => {
      let action$: Observable<RaidenAction> = of(
        transferUnlock.request(undefined, { secrethash }),
      );
      const state$ = new BehaviorSubject(transferingState);

      const unlock = (
        await transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
          .pipe(
            tap(action => state$.next(raidenReducer(state$.value, action))),
            filter(isActionOf(transferUnlock.success)),
          )
          .toPromise()
      ).payload.message;

      const message: Processed = {
          type: MessageType.PROCESSED,
          message_identifier: unlock.message_identifier,
        },
        signed = await signMessage(partnerSigner, message);
      action$ = of(
        messageReceived(
          { text: encodeJsonMessage(signed), message: signed, ts: Date.now() },
          { address: partner },
        ),
      );

      await expect(
        transferUnlockProcessedReceivedEpic(action$, state$)
          .pipe(toArray())
          .toPromise(),
      ).resolves.toEqual(
        expect.arrayContaining([
          transfer.success(
            { balanceProof: expect.objectContaining({ sender: depsMock.address }) },
            { secrethash },
          ),
          transferUnlockProcessed(
            { message: expect.objectContaining({ type: MessageType.PROCESSED }) },
            { secrethash },
          ),
        ]),
      );
    });

    describe('transferExpireProcessedEpic', () => {
      let state$: BehaviorSubject<RaidenState>, expired: Signed<LockExpired>;

      beforeEach(async () => {
        state$ = new BehaviorSubject(
          raidenReducer(
            transferingState,
            newBlock({ blockNumber: signedTransfer.lock.expiration.toNumber() + 1 }),
          ),
        );
        const action$ = of(transferExpire.request(undefined, { secrethash }));

        getLatest$(action$, state$).subscribe(depsMock.latest$);

        const expiredAction = await transferGenerateAndSignEnvelopeMessageEpic(
          action$,
          state$,
          depsMock,
        ).toPromise();

        if (!isActionOf(transferExpire.success, expiredAction)) throw new Error('not expired');
        expired = expiredAction.payload.message;

        state$.next(raidenReducer(state$.value, expiredAction));
      });

      test('success', async () => {
        expect.assertions(1);

        const processed: Processed = {
            type: MessageType.PROCESSED,
            message_identifier: expired.message_identifier,
          },
          signed = await signMessage(partnerSigner, processed),
          received = messageReceived(
            {
              text: encodeJsonMessage(signed),
              message: signed,
              ts: Date.now(),
            },
            { address: partner },
          );

        await expect(
          transferExpireProcessedEpic(of(received), state$).toPromise(),
        ).resolves.toEqual(transferExpireProcessed({ message: signed }, { secrethash }));
      });

      test('fail sender mismatch', async () => {
        expect.assertions(1);

        const processed: Processed = {
            type: MessageType.PROCESSED,
            message_identifier: expired.message_identifier,
          },
          signed = await signMessage(depsMock.signer, processed),
          received = messageReceived(
            {
              text: encodeJsonMessage(signed),
              message: signed,
              ts: Date.now(),
            },
            { address: depsMock.address },
          );

        await expect(
          transferExpireProcessedEpic(of(received), state$).toPromise(),
        ).resolves.toBeUndefined();
      });
    });

    describe('transferChannelClosedEpic', () => {
      const action = channelClose.request(undefined, { tokenNetwork, partner }),
        state$ = new BehaviorSubject(transferingState);

      beforeEach(() => state$.next(transferingState));

      test('fail if neither revealed nor unlocked', async () => {
        await expect(
          transferChannelClosedEpic(of(action), state$)
            .pipe(toArray())
            .toPromise(),
        ).resolves.toEqual(
          expect.arrayContaining([transfer.failure(expect.any(Error), { secrethash })]),
        );
      });

      test('success if unlocked', async () => {
        const unlockedAction = await transferGenerateAndSignEnvelopeMessageEpic(
          of(transferUnlock.request(undefined, { secrethash })),
          state$,
          depsMock,
        ).toPromise();

        state$.next(raidenReducer(state$.value, unlockedAction));

        await expect(
          transferChannelClosedEpic(of(action), state$)
            .pipe(toArray())
            .toPromise(),
        ).resolves.toEqual(
          expect.arrayContaining([
            transfer.success(
              { balanceProof: expect.objectContaining({ sender: depsMock.address }) },
              { secrethash },
            ),
          ]),
        );
      });

      test('success if secret revealed', async () => {
        const reveal: SecretReveal = {
            type: MessageType.SECRET_REVEAL,
            message_identifier: makeMessageId(),
            secret,
          },
          signed = await signMessage(depsMock.signer, reveal),
          revealAction = transferSecretReveal({ message: signed }, { secrethash });

        state$.next(raidenReducer(state$.value, revealAction));

        await expect(
          transferChannelClosedEpic(of(action), state$)
            .pipe(toArray())
            .toPromise(),
        ).resolves.toEqual(expect.arrayContaining([transfer.success({}, { secrethash })]));
      });

      test('skip different channel', async () => {
        await expect(
          transferChannelClosedEpic(
            of(channelClose.request(undefined, { tokenNetwork, partner: token })),
            state$,
          ).toPromise(),
        ).resolves.toBeUndefined();
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

        const output = await transferReceivedReplyProcessedEpic(
          of(action, otherAction, action),
          of(transferingState),
          depsMock,
        )
          .pipe(toArray())
          .toPromise();

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

        // success case
        await expect(
          transferRefundedEpic(of(otherAction, action), of(transferingState))
            .pipe(toArray())
            .toPromise(),
        ).resolves.toEqual(
          expect.arrayContaining([
            transferRefunded({ message: refund }, { secrethash }),
            {
              type: transfer.failure.type,
              payload: expect.any(Error),
              error: true,
              meta: { secrethash },
            },
          ]),
        );

        // if transfer expired, refund is ignored
        await expect(
          transferRefundedEpic(
            of(action),
            of(
              [newBlock({ blockNumber: signedTransfer.lock.expiration.toNumber() + 1 })].reduce(
                raidenReducer,
                transferingState,
              ),
            ),
          ).toPromise(),
        ).resolves.toBeUndefined();
      });
    });

    describe('withdraw request', () => {
      const state$ = new BehaviorSubject(transferingState),
        partnerDeposit = bigNumberify(30) as UInt<32>,
        transferredAmount = value.add(fee),
        withdrawableAmount = partnerDeposit.add(transferredAmount) as UInt<32>;

      /* state$ holds the state when a transfer unlocked and completed */
      beforeEach(async () => {
        state$.next(
          [
            channelDeposit.success(
              {
                id: channelId,
                participant: partner,
                totalDeposit: partnerDeposit,
                txHash,
              },
              { tokenNetwork, partner },
            ),
          ].reduce(raidenReducer, transferingState),
        );
        await transferGenerateAndSignEnvelopeMessageEpic(
          of(transferUnlock.request(undefined, { secrethash })),
          state$,
          depsMock,
        )
          .pipe(tap(action => state$.next(raidenReducer(state$.value, action))))
          .toPromise();
      });

      test('success', async () => {
        expect.assertions(6);

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

        const action$ = of(withdrawRequestAction, withdrawRequestAction);

        getLatest$(action$, state$).subscribe(depsMock.latest$);

        const output = await transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
          .pipe(toArray())
          .toPromise();

        expect(output).toHaveLength(2);
        expect(output[0].payload).toEqual(output[1].payload);
        expect(output[0]).toEqual({
          type: withdrawReceive.success.type,
          payload: {
            message: {
              ...request,
              type: MessageType.WITHDRAW_CONFIRMATION,
              message_identifier: expect.any(BigNumber),
              nonce: state$.value.channels[tokenNetwork][partner].own.balanceProof!.nonce.add(1),
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
          ),
          action = await withdrawRequestReceivedEpic(of(messageReceivedAction)).toPromise();

        await expect(
          transferGenerateAndSignEnvelopeMessageEpic(of(action), state$, depsMock).toPromise(),
        ).resolves.toBeUndefined();
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

        state$.next([newBlock({ blockNumber: 125 + 20 + 2 })].reduce(raidenReducer, state$.value));

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

        state$.next(
          [channelClose.request(undefined, { tokenNetwork, partner })].reduce(
            raidenReducer,
            state$.value,
          ),
        );

        await expect(
          transferGenerateAndSignEnvelopeMessageEpic(of(action), state$, depsMock).toPromise(),
        ).resolves.toBeUndefined();
      });
    });
  });
});
