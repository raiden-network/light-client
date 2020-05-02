/* eslint-disable @typescript-eslint/no-explicit-any,@typescript-eslint/camelcase */
import { bigNumberify, BigNumber } from 'ethers/utils';
import { Zero, One, HashZero } from 'ethers/constants';
import { of, EMPTY } from 'rxjs';
import { first, toArray, tap, pluck } from 'rxjs/operators';

import { Capabilities } from 'raiden-ts/constants';
import { raidenConfigUpdate } from 'raiden-ts/actions';
import {
  MessageType,
  LockedTransfer,
  Unlock,
  LockExpired,
  Processed,
  SecretReveal,
  SecretRequest,
} from 'raiden-ts/messages/types';
import { signMessage } from 'raiden-ts/messages/utils';
import { tokenMonitored, channelOpen, channelDeposit, newBlock } from 'raiden-ts/channels/actions';
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
  transferSecretReveal,
  transferSecretRegister,
} from 'raiden-ts/transfers/actions';
import {
  transferGenerateAndSignEnvelopeMessageEpic,
  transferProcessedSendEpic,
  transferSecretRevealedEpic,
  transferRequestUnlockEpic,
  monitorSecretRegistryEpic,
  transferAutoRegisterEpic,
  transferSecretRegisterEpic,
  transferRetryMessageEpic,
  initQueuePendingReceivedEpic,
} from 'raiden-ts/transfers/epics';
import { matrixPresence } from 'raiden-ts/transport/actions';
import { UInt, Int, Signed } from 'raiden-ts/utils/types';
import {
  makeMessageId,
  makeSecret,
  getSecrethash,
  makePaymentId,
  getLocksroot,
} from 'raiden-ts/transfers/utils';
import { Direction } from 'raiden-ts/transfers/state';

import { epicFixtures } from '../fixtures';
import { raidenEpicDeps, makeSignature, makeLog } from '../mocks';
import { pluckDistinct } from 'raiden-ts/utils/rx';

describe('receive transfers', () => {
  let depsMock: ReturnType<typeof raidenEpicDeps>;
  let token: ReturnType<typeof epicFixtures>['token'],
    tokenNetwork: ReturnType<typeof epicFixtures>['tokenNetwork'],
    channelId: ReturnType<typeof epicFixtures>['channelId'],
    partner: ReturnType<typeof epicFixtures>['partner'],
    settleTimeout: ReturnType<typeof epicFixtures>['settleTimeout'],
    isFirstParticipant: ReturnType<typeof epicFixtures>['isFirstParticipant'],
    txHash: ReturnType<typeof epicFixtures>['txHash'],
    partnerSigner: ReturnType<typeof epicFixtures>['partnerSigner'],
    action$: ReturnType<typeof epicFixtures>['action$'],
    state$: ReturnType<typeof epicFixtures>['state$'];

  const secret = makeSecret();
  const secrethash = getSecrethash(secret);
  const amount = bigNumberify(10) as UInt<32>;
  const direction = Direction.RECEIVED;
  let expiration: UInt<32>;
  let transf: Signed<LockedTransfer>;

  beforeEach(async () => {
    depsMock = raidenEpicDeps();
    ({
      token,
      tokenNetwork,
      channelId,
      partner,
      settleTimeout,
      isFirstParticipant,
      txHash,
      partnerSigner,
      action$,
      state$,
    } = epicFixtures(depsMock));

    [
      raidenConfigUpdate({
        caps: {
          // disable NO_RECEIVE
          [Capabilities.NO_MEDIATE]: true,
          [Capabilities.NO_DELIVERY]: true,
        },
      }),
      tokenMonitored({ token, tokenNetwork }),
      channelOpen.success(
        {
          id: channelId,
          settleTimeout,
          isFirstParticipant,
          token,
          txHash,
          txBlock: 121,
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
          txBlock: 122,
          confirmed: true,
        },
        { tokenNetwork, partner },
      ),
      channelDeposit.success(
        {
          id: channelId,
          participant: partner,
          totalDeposit: bigNumberify(500) as UInt<32>,
          txHash,
          txBlock: 122,
          confirmed: true,
        },
        { tokenNetwork, partner },
      ),
    ].forEach((a) => action$.next(a));

    const { state, config } = await depsMock.latest$.pipe(first()).toPromise();

    expiration = bigNumberify(state.blockNumber + config.revealTimeout * 2) as UInt<32>;
    const lock = {
      secrethash,
      amount,
      expiration,
    };
    const unsigned: LockedTransfer = {
      type: MessageType.LOCKED_TRANSFER,
      payment_identifier: makePaymentId(),
      message_identifier: makeMessageId(),
      chain_id: bigNumberify(depsMock.network.chainId) as UInt<32>,
      token,
      token_network_address: tokenNetwork,
      recipient: depsMock.address,
      target: depsMock.address,
      initiator: partner,
      channel_identifier: bigNumberify(channelId) as UInt<32>,
      metadata: { routes: [{ route: [depsMock.address] }] },
      lock,
      locksroot: getLocksroot([lock]),
      nonce: One as UInt<8>,
      transferred_amount: Zero as UInt<32>,
      locked_amount: lock.amount,
    };
    transf = await signMessage(partnerSigner, unsigned, depsMock);
  });

  afterEach(() => {
    jest.clearAllMocks();
    action$.complete();
    state$.complete();
    depsMock.latest$.complete();
  });

  describe('receiving LockedTransfer', () => {
    test('success', async () => {
      expect.assertions(3);

      await expect(
        transferGenerateAndSignEnvelopeMessageEpic(
          of(messageReceived({ text: '', message: transf, ts: Date.now() }, { address: partner })),
          state$,
          depsMock,
        )
          .pipe(
            tap((a) => action$.next(a)),
            toArray(),
          )
          .toPromise(),
      ).resolves.toEqual(
        expect.arrayContaining([
          transferSigned({ message: transf, fee: Zero as Int<32> }, { secrethash, direction }),
          matrixPresence.request(undefined, { address: partner }),
          transferProcessed(
            {
              message: expect.objectContaining({
                type: MessageType.PROCESSED,
                message_identifier: transf.message_identifier,
              }),
            },
            { secrethash, direction },
          ),
          transferSecretRequest(
            {
              message: {
                type: MessageType.SECRET_REQUEST,
                payment_identifier: transf.payment_identifier,
                secrethash,
                amount,
                expiration,
                message_identifier: expect.any(BigNumber),
                signature: expect.any(String),
              },
            },
            { secrethash, direction },
          ),
        ]),
      );

      // retry same msg resend Processed
      await expect(
        transferGenerateAndSignEnvelopeMessageEpic(
          of(messageReceived({ text: '', message: transf, ts: Date.now() }, { address: partner })),
          state$,
          depsMock,
        ).toPromise(),
      ).resolves.toEqual(
        transferProcessed(
          {
            message: expect.objectContaining({
              type: MessageType.PROCESSED,
              message_identifier: transf.message_identifier,
            }),
          },
          { secrethash, direction },
        ),
      );

      // retry different msg ignores
      await expect(
        transferGenerateAndSignEnvelopeMessageEpic(
          of(
            messageReceived(
              {
                text: '',
                message: { ...transf, message_identifier: makeMessageId() },
                ts: Date.now(),
              },
              { address: partner },
            ),
          ),
          state$,
          depsMock,
        ).toPromise(),
      ).resolves.toBeUndefined();
    });

    test('fail: invalid nonce', async () => {
      expect.assertions(1);

      await expect(
        transferGenerateAndSignEnvelopeMessageEpic(
          of(
            messageReceived(
              {
                text: '',
                message: { ...transf, nonce: transf.nonce.add(1) as UInt<8> },
                ts: Date.now(),
              },
              { address: partner },
            ),
          ),
          state$,
          depsMock,
        ).toPromise(),
      ).resolves.toEqual(transfer.failure(expect.any(Error), { secrethash, direction }));
    });
  });

  describe('received transfer in state', () => {
    beforeEach(async () => {
      transferGenerateAndSignEnvelopeMessageEpic(
        of(messageReceived({ text: '', message: transf, ts: Date.now() }, { address: partner })),
        state$,
        depsMock,
      ).subscribe((a) => action$.next(a));
    });

    test('receive Unlock', async () => {
      expect.assertions(5);

      const unsigned: Unlock = {
        type: MessageType.UNLOCK,
        payment_identifier: transf.payment_identifier,
        message_identifier: makeMessageId(),
        chain_id: transf.chain_id,
        token_network_address: tokenNetwork,
        channel_identifier: transf.channel_identifier,
        nonce: transf.nonce.add(1) as UInt<8>,
        transferred_amount: transf.transferred_amount.add(amount) as UInt<32>,
        locked_amount: transf.locked_amount.sub(amount) as UInt<32>,
        locksroot: getLocksroot([]),
        secret,
      };
      const unlock = await signMessage(partnerSigner, unsigned, depsMock);

      // ignore unknown secret
      await expect(
        transferGenerateAndSignEnvelopeMessageEpic(
          of(
            messageReceived(
              {
                text: '',
                message: { ...unlock, secret: secrethash },
                ts: Date.now(),
              },
              { address: partner },
            ),
          ),
          state$,
          depsMock,
        ).toPromise(),
      ).resolves.toBeUndefined();

      // fail invalid nonce
      await expect(
        transferGenerateAndSignEnvelopeMessageEpic(
          of(
            messageReceived(
              {
                text: '',
                message: { ...unlock, nonce: transf.nonce },
                ts: Date.now(),
              },
              { address: partner },
            ),
          ),
          state$,
          depsMock,
        ).toPromise(),
      ).resolves.toEqual(transferUnlock.failure(expect.any(Error), { secrethash, direction }));

      // success
      await expect(
        transferGenerateAndSignEnvelopeMessageEpic(
          of(messageReceived({ text: '', message: unlock, ts: Date.now() }, { address: partner })),
          state$,
          depsMock,
        )
          .pipe(
            tap((a) => action$.next(a)),
            toArray(),
          )
          .toPromise(),
      ).resolves.toEqual(
        expect.arrayContaining([
          transferUnlock.success({ message: unlock }, { secrethash, direction }),
          transferUnlockProcessed(
            {
              message: expect.objectContaining({
                type: MessageType.PROCESSED,
                message_identifier: unlock.message_identifier,
              }),
            },
            { secrethash, direction },
          ),
          transfer.success(
            { balanceProof: expect.objectContaining({ nonce: unlock.nonce }) },
            { secrethash, direction },
          ),
        ]),
      );

      // retry receives Processed again
      await expect(
        transferGenerateAndSignEnvelopeMessageEpic(
          of(messageReceived({ text: '', message: unlock, ts: Date.now() }, { address: partner })),
          state$,
          depsMock,
        ).toPromise(),
      ).resolves.toEqual(
        transferUnlockProcessed(
          {
            message: expect.objectContaining({
              type: MessageType.PROCESSED,
              message_identifier: unlock.message_identifier,
            }),
          },
          { secrethash, direction },
        ),
      );

      // retry different msg ignores
      await expect(
        transferGenerateAndSignEnvelopeMessageEpic(
          of(
            messageReceived(
              {
                text: '',
                message: { ...unlock, message_identifier: makeMessageId() },
                ts: Date.now(),
              },
              { address: partner },
            ),
          ),
          state$,
          depsMock,
        ).toPromise(),
      ).resolves.toBeUndefined();
    });

    test('receive LockExpired', async () => {
      expect.assertions(5);
      action$.next(newBlock({ blockNumber: expiration.toNumber() + 5 }));

      const unsigned: LockExpired = {
        type: MessageType.LOCK_EXPIRED,
        message_identifier: makeMessageId(),
        chain_id: transf.chain_id,
        token_network_address: tokenNetwork,
        recipient: depsMock.address,
        channel_identifier: transf.channel_identifier,
        nonce: transf.nonce.add(1) as UInt<8>,
        transferred_amount: transf.transferred_amount,
        locked_amount: transf.locked_amount.sub(amount) as UInt<32>,
        locksroot: getLocksroot([]),
        secrethash,
      };
      const expired = await signMessage(partnerSigner, unsigned, depsMock);

      // ignore unknown secrethash
      await expect(
        transferGenerateAndSignEnvelopeMessageEpic(
          of(
            messageReceived(
              {
                text: '',
                message: { ...expired, secrethash: secret },
                ts: Date.now(),
              },
              { address: partner },
            ),
          ),
          state$,
          depsMock,
        ).toPromise(),
      ).resolves.toBeUndefined();

      // fail invalid nonce
      await expect(
        transferGenerateAndSignEnvelopeMessageEpic(
          of(
            messageReceived(
              {
                text: '',
                message: { ...expired, nonce: transf.nonce },
                ts: Date.now(),
              },
              { address: partner },
            ),
          ),
          state$,
          depsMock,
        ).toPromise(),
      ).resolves.toEqual(transferExpire.failure(expect.any(Error), { secrethash, direction }));

      await expect(
        transferGenerateAndSignEnvelopeMessageEpic(
          of(
            messageReceived({ text: '', message: expired, ts: Date.now() }, { address: partner }),
          ),
          state$,
          depsMock,
        )
          .pipe(
            tap((a) => action$.next(a)),
            toArray(),
          )
          .toPromise(),
      ).resolves.toEqual(
        expect.arrayContaining([
          transferExpire.success({ message: expired }, { secrethash, direction }),
          transferExpireProcessed(
            {
              message: expect.objectContaining({
                type: MessageType.PROCESSED,
                message_identifier: expired.message_identifier,
              }),
            },
            { secrethash, direction },
          ),
          transfer.failure(expect.any(Error), { secrethash, direction }),
        ]),
      );

      // retry same msg resend Processed
      await expect(
        transferGenerateAndSignEnvelopeMessageEpic(
          of(
            messageReceived({ text: '', message: expired, ts: Date.now() }, { address: partner }),
          ),
          state$,
          depsMock,
        ).toPromise(),
      ).resolves.toEqual(
        transferExpireProcessed(
          {
            message: expect.objectContaining({
              type: MessageType.PROCESSED,
              message_identifier: expired.message_identifier,
            }),
          },
          { secrethash, direction },
        ),
      );

      // retry different msg ignores
      await expect(
        transferGenerateAndSignEnvelopeMessageEpic(
          of(
            messageReceived(
              {
                text: '',
                message: { ...expired, message_identifier: makeMessageId() },
                ts: Date.now(),
              },
              { address: partner },
            ),
          ),
          state$,
          depsMock,
        ).toPromise(),
      ).resolves.toBeUndefined();
    });

    test('send Processed for received EnvelopeMessage', async () => {
      expect.assertions(1);
      const message: Signed<Processed> = {
        type: MessageType.PROCESSED,
        message_identifier: transf.message_identifier,
        signature: makeSignature(),
      };
      await expect(
        transferProcessedSendEpic(
          of(transferProcessed({ message }, { secrethash, direction })),
          depsMock.latest$.pipe(pluck('state')),
        ).toPromise(),
      ).resolves.toEqual(
        messageSend.request(
          { message },
          { address: partner, msgId: message.message_identifier.toString() },
        ),
      );
    });

    test('SecretReveal registers secret', async () => {
      expect.assertions(3);

      // no need for Signed
      const message: SecretReveal = {
        type: MessageType.SECRET_REVEAL,
        message_identifier: transf.message_identifier,
        secret,
      };

      // secret isn't known
      await expect(
        depsMock.latest$.pipe(pluck('state'), first()).toPromise(),
      ).resolves.not.toMatchObject({
        received: { [secrethash]: { secret: [expect.any(Number), { value: secret }] } },
      });

      await expect(
        transferSecretRevealedEpic(
          of(messageReceived({ text: '', message, ts: Date.now() }, { address: partner })),
          depsMock.latest$.pipe(pluck('state')),
        )
          .pipe(tap((a) => action$.next(a)))
          .toPromise(),
      ).resolves.toEqual(transferSecret({ secret }, { secrethash, direction }));

      // but now, is
      await expect(
        depsMock.latest$.pipe(pluck('state'), first()).toPromise(),
      ).resolves.toMatchObject({
        received: { [secrethash]: { secret: [expect.any(Number), { value: secret }] } },
      });
    });

    test('learning secret reveals to partner to get unlock', async () => {
      expect.assertions(3);

      const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');
      signerSpy.mockRejectedValueOnce(new Error('signature rejected once'));

      // signature gets rejected first, non-fatal
      await expect(
        transferRequestUnlockEpic(
          of(transferSecret({ secret }, { secrethash, direction })),
          state$,
          depsMock,
        )
          .pipe(tap((a) => action$.next(a)))
          .toPromise(),
      ).resolves.toBeUndefined();

      // signature accepted
      await expect(
        transferRequestUnlockEpic(
          of(transferSecret({ secret }, { secrethash, direction })),
          state$,
          depsMock,
        )
          .pipe(tap((a) => action$.next(a)))
          .toPromise(),
      ).resolves.toEqual(
        transferSecretReveal(
          {
            message: expect.objectContaining({
              type: MessageType.SECRET_REVEAL,
              secret,
              signature: expect.any(String),
            }),
          },
          { secrethash, direction },
        ),
      );

      // expect SecretReveal to be persisted in state
      await expect(
        depsMock.latest$.pipe(pluck('state'), first()).toPromise(),
      ).resolves.toMatchObject({
        received: {
          [secrethash]: {
            secretReveal: [expect.any(Number), { type: MessageType.SECRET_REVEAL }],
          },
        },
      });
    });

    test('secret revealed on-chain for received transfer', async () => {
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
          blockNumber: transf.lock.expiration.toNumber() + 1,
          transactionHash: txHash,
          filter: depsMock.secretRegistryContract.filters.SecretRevealed(secrethash, null),
          data: secret, // non-indexed secret
        }),
      );
      expect(secrets).toHaveLength(0);

      const txBlock = transf.lock.expiration.toNumber() - 1;
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

    test('secret auto register', async () => {
      expect.assertions(2);

      let output: transferSecretRegister.request | undefined = undefined;

      // first, get the secret known to the node
      action$.next(transferSecret({ secret }, { secrethash, direction }));
      action$.subscribe((a) => {
        // when secret registration requested, register it
        if (transferSecretRegister.request.is(a)) {
          output = a;
          action$.next(
            transferSecretRegister.success(
              {
                secret,
                txHash,
                txBlock: 123,
                confirmed: true,
              },
              {
                secrethash,
                direction,
              },
            ),
          );
          action$.complete();
        }
      });

      transferAutoRegisterEpic(
        action$,
        depsMock.latest$.pipe(pluck('state')),
        depsMock,
      ).subscribe((a) => action$.next(a));

      [newBlock({ blockNumber: 124 }), newBlock({ blockNumber: 125 })].forEach((a) =>
        action$.next(a),
      );

      expect(output).toBeUndefined();
      action$.next(newBlock({ blockNumber: expiration.toNumber() - 1 }));

      await action$.toPromise();
      expect(output).toEqual(
        transferSecretRegister.request({ secret }, { secrethash, direction }),
      );
    });

    test('retry secret request until reveal, reveal until register', async () => {
      expect.assertions(1);

      action$.next(raidenConfigUpdate({ httpTimeout: 30 }));

      const request: Signed<SecretRequest> = {
        type: MessageType.SECRET_REQUEST,
        payment_identifier: transf.payment_identifier,
        message_identifier: transf.message_identifier,
        secrethash,
        amount,
        expiration,
        signature: makeSignature(),
      };
      const reveal: Signed<SecretReveal> = {
        type: MessageType.SECRET_REVEAL,
        secret,
        message_identifier: makeMessageId(),
        signature: makeSignature(),
      };

      let msgCnt = 0;
      action$.subscribe((a) => {
        if (messageSend.request.is(a)) {
          // succeeds messageSend request immediatelly
          action$.next(messageSend.success(undefined, a.meta));
        } else if (messageSend.success.is(a) && ++msgCnt === 2) {
          // on 3rd request msg, receive reveal
          action$.next(transferSecretReveal({ message: reveal }, { secrethash, direction }));
          // "register" secret on-chain, to stop reveal retry
          action$.next(
            transferSecretRegister.success(
              { secret, txHash, txBlock: 124, confirmed: true },
              { secrethash, direction },
            ),
          );
          setTimeout(() => action$.complete(), 10);
        }
      });

      const promise = transferRetryMessageEpic(action$, state$, depsMock)
        .pipe(
          tap((a) => action$.next(a)),
          toArray(),
        )
        .toPromise();

      action$.next(transferSecretRequest({ message: request }, { secrethash, direction }));

      await expect(promise).resolves.toEqual(
        expect.arrayContaining([
          messageSend.request(
            { message: request },
            { address: partner, msgId: expect.any(String) },
          ),
          messageSend.request(
            { message: reveal },
            { address: partner, msgId: expect.any(String) },
          ),
        ]),
      );
    });

    test('initQueuePendingReceivedEpic', async () => {
      expect.assertions(4);
      const state$ = depsMock.latest$.pipe(pluckDistinct('state'));

      // receiving enabled, unknown secret
      const transf = await state$
        .pipe(pluck('received', secrethash, 'transfer', '1'), first())
        .toPromise();
      await expect(
        initQueuePendingReceivedEpic(EMPTY, state$, depsMock).pipe(toArray()).toPromise(),
      ).resolves.toEqual([
        transferSigned({ message: transf, fee: Zero as Int<32> }, { secrethash, direction }),
        matrixPresence.request(undefined, { address: partner }),
        transferSecretRequest(
          { message: expect.objectContaining({ type: MessageType.SECRET_REQUEST }) },
          { secrethash, direction },
        ),
      ]);

      // with receiving disabled, ensure transferSigned but no secret requested
      action$.next(raidenConfigUpdate({ caps: { [Capabilities.NO_RECEIVE]: true } }));
      await expect(
        initQueuePendingReceivedEpic(EMPTY, state$, depsMock).pipe(toArray()).toPromise(),
      ).resolves.toEqual([
        transferSigned({ message: transf, fee: Zero as Int<32> }, { secrethash, direction }),
      ]);

      // secret known, no reveal signed, emits transferSecret to prompt reveal signing again
      action$.next(transferSecret({ secret }, { secrethash, direction }));
      await expect(
        initQueuePendingReceivedEpic(EMPTY, state$, depsMock).pipe(toArray()).toPromise(),
      ).resolves.toEqual([
        transferSigned({ message: transf, fee: Zero as Int<32> }, { secrethash, direction }),
        transferSecret({ secret }, { secrethash, direction }),
      ]);

      // reveal signed
      const reveal: Signed<SecretReveal> = {
        type: MessageType.SECRET_REVEAL,
        secret,
        message_identifier: makeMessageId(),
        signature: makeSignature(),
      };
      action$.next(transferSecretReveal({ message: reveal }, { secrethash, direction }));
      await expect(
        initQueuePendingReceivedEpic(EMPTY, state$, depsMock).pipe(toArray()).toPromise(),
      ).resolves.toEqual([
        transferSigned({ message: transf, fee: Zero as Int<32> }, { secrethash, direction }),
        transferSecretReveal({ message: reveal }, { secrethash, direction }),
      ]);
    });
  });

  test('transferSecretRegisterEpic', async () => {
    expect.assertions(2);

    // first fail
    depsMock.secretRegistryContract.functions.registerSecret.mockResolvedValueOnce({
      hash: txHash,
      confirmations: 1,
      nonce: 1,
      gasLimit: bigNumberify(1e6),
      gasPrice: bigNumberify(2e10),
      value: Zero,
      data: '0x',
      chainId: depsMock.network.chainId,
      from: depsMock.address,
      wait: jest.fn().mockResolvedValue({ byzantium: true, status: 0 }),
    });

    // then succeeds
    depsMock.secretRegistryContract.functions.registerSecret.mockResolvedValueOnce({
      hash: txHash,
      confirmations: 1,
      nonce: 1,
      gasLimit: bigNumberify(1e6),
      gasPrice: bigNumberify(2e10),
      value: Zero,
      data: '0x',
      chainId: depsMock.network.chainId,
      from: depsMock.address,
      wait: jest.fn().mockResolvedValue({ byzantium: true, status: 1 }),
    });

    await expect(
      transferSecretRegisterEpic(
        of(transferSecretRegister.request({ secret }, { secrethash, direction })),
        state$,
        depsMock,
      ).toPromise(),
    ).resolves.toEqual(
      transferSecretRegister.failure(expect.any(Error), { secrethash, direction }),
    );

    await expect(
      transferSecretRegisterEpic(
        of(transferSecretRegister.request({ secret }, { secrethash, direction })),
        state$,
        depsMock,
      ).toPromise(),
    ).resolves.toBeUndefined();
  });
});
