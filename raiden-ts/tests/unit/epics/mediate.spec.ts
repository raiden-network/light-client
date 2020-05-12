/* eslint-disable @typescript-eslint/no-explicit-any,@typescript-eslint/camelcase */
import { bigNumberify } from 'ethers/utils';
import { Zero, One } from 'ethers/constants';
import { of } from 'rxjs';
import { first } from 'rxjs/operators';

import { Capabilities } from 'raiden-ts/constants';
import { raidenConfigUpdate } from 'raiden-ts/actions';
import { MessageType, LockedTransfer } from 'raiden-ts/messages/types';
import { signMessage } from 'raiden-ts/messages/utils';
import { tokenMonitored, channelOpen, channelDeposit } from 'raiden-ts/channels/actions';
import { messageReceived } from 'raiden-ts/messages/actions';
import { transfer } from 'raiden-ts/transfers/actions';
import {
  transferGenerateAndSignEnvelopeMessageEpic,
  transferMediateEpic,
} from 'raiden-ts/transfers/epics';
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
import { raidenEpicDeps } from '../mocks';

describe('mediate transfers', () => {
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
          [Capabilities.NO_DELIVERY]: true,
          // disable NO_RECEIVE & NO_MEDIATE
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
      target: partner, // lol
      initiator: partner,
      channel_identifier: bigNumberify(channelId) as UInt<32>,
      metadata: { routes: [{ route: [depsMock.address, partner] }] },
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

  test('success: receiving a transfer not for us forwards it to target', async () => {
    expect.assertions(1);

    const promise = transferMediateEpic(action$, state$, depsMock).toPromise();

    // receive transf
    transferGenerateAndSignEnvelopeMessageEpic(
      of(messageReceived({ text: '', message: transf, ts: Date.now() }, { address: partner })),
      state$,
      depsMock,
    ).subscribe((a) => action$.next(a));
    setTimeout(() => action$.complete(), 10);

    await expect(promise).resolves.toEqual(
      transfer.request(
        {
          tokenNetwork,
          target: partner,
          value: amount,
          paymentId: transf.payment_identifier,
          paths: [{ path: [partner], fee: Zero as Int<32> }],
          expiration: expiration.toNumber(),
          initiator: partner,
        },
        { secrethash, direction: Direction.SENT },
      ),
    );
  });

  test('skip if NO_MEDIATE', async () => {
    expect.assertions(1);
    action$.next(
      raidenConfigUpdate({
        caps: {
          [Capabilities.NO_DELIVERY]: true,
          [Capabilities.NO_MEDIATE]: true,
          // disable NO_RECEIVE
        },
      }),
    );

    const promise = transferMediateEpic(action$, state$, depsMock).toPromise();

    // receive transf
    transferGenerateAndSignEnvelopeMessageEpic(
      of(messageReceived({ text: '', message: transf, ts: Date.now() }, { address: partner })),
      state$,
      depsMock,
    ).subscribe((a) => action$.next(a));
    setTimeout(() => action$.complete(), 10);

    await expect(promise).resolves.toBeUndefined();
  });
});
