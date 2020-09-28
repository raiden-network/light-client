/* eslint-disable @typescript-eslint/no-explicit-any */

import { raidenEpicDeps, makeSignature, mockRTC, sleep } from '../mocks';
import { epicFixtures } from '../fixtures';

import { createClient } from 'matrix-js-sdk';
import { of, timer, EMPTY, Observable } from 'rxjs';
import { first, tap, takeUntil, toArray } from 'rxjs/operators';
import { verifyMessage, BigNumber } from 'ethers/utils';

import { RaidenAction, raidenConfigUpdate } from 'raiden-ts/actions';
import { raidenReducer } from 'raiden-ts/reducer';
import { channelMonitored } from 'raiden-ts/channels/actions';
import {
  matrixPresence,
  matrixRoom,
  matrixSetup,
  matrixRoomLeave,
  rtcChannel,
} from 'raiden-ts/transport/actions';
import { messageSend, messageReceived, messageGlobalSend } from 'raiden-ts/messages/actions';

import {
  initMatrixEpic,
  matrixMonitorChannelPresenceEpic,
  matrixShutdownEpic,
  matrixMonitorPresenceEpic,
  matrixPresenceUpdateEpic,
  matrixCreateRoomEpic,
  matrixInviteEpic,
  matrixHandleInvitesEpic,
  matrixLeaveExcessRoomsEpic,
  matrixLeaveUnknownRoomsEpic,
  matrixCleanLeftRoomsEpic,
  matrixMessageSendEpic,
  matrixMessageReceivedEpic,
  matrixMessageReceivedUpdateRoomEpic,
  deliveredEpic,
  matrixMessageGlobalSendEpic,
  matrixCleanMissingRoomsEpic,
  rtcConnectEpic,
  matrixUpdateCapsEpic,
} from 'raiden-ts/transport/epics';
import { MessageType, Delivered, Processed } from 'raiden-ts/messages/types';
import { makeMessageId } from 'raiden-ts/transfers/utils';
import { encodeJsonMessage, signMessage } from 'raiden-ts/messages/utils';
import { ErrorCodes } from 'raiden-ts/utils/error';
import { Signed, Address } from 'raiden-ts/utils/types';
import { Capabilities } from 'raiden-ts/constants';
import { jsonParse, jsonStringify } from 'raiden-ts/utils/data';

describe('transport epic', () => {
  let depsMock: ReturnType<typeof raidenEpicDeps>,
    token: ReturnType<typeof epicFixtures>['token'],
    tokenNetwork: ReturnType<typeof epicFixtures>['tokenNetwork'],
    channelId: ReturnType<typeof epicFixtures>['channelId'],
    partner: ReturnType<typeof epicFixtures>['partner'],
    state: ReturnType<typeof epicFixtures>['state'],
    matrixServer: ReturnType<typeof epicFixtures>['matrixServer'],
    partnerRoomId: ReturnType<typeof epicFixtures>['partnerRoomId'],
    partnerUserId: ReturnType<typeof epicFixtures>['partnerUserId'],
    partnerSigner: ReturnType<typeof epicFixtures>['partnerSigner'],
    matrix: ReturnType<typeof epicFixtures>['matrix'],
    userId: ReturnType<typeof epicFixtures>['userId'],
    accessToken: ReturnType<typeof epicFixtures>['accessToken'],
    deviceId: ReturnType<typeof epicFixtures>['deviceId'],
    displayName: ReturnType<typeof epicFixtures>['displayName'],
    processed: ReturnType<typeof epicFixtures>['processed'],
    action$: ReturnType<typeof epicFixtures>['action$'],
    state$: ReturnType<typeof epicFixtures>['state$'];

  const fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    text: jest.fn(async () => `- ${matrixServer}`),
  }));
  Object.assign(global, { fetch });

  beforeEach(() => {
    depsMock = raidenEpicDeps();
    ({
      token,
      tokenNetwork,
      channelId,
      partner,
      state,
      matrixServer,
      partnerRoomId,
      partnerUserId,
      partnerSigner,
      matrix,
      userId,
      accessToken,
      deviceId,
      displayName,
      processed,
      action$,
      state$,
    } = epicFixtures(depsMock));
    depsMock.matrix$.next(matrix);
    depsMock.matrix$.complete();

    (createClient as jest.Mock).mockReturnValue(matrix);
  });

  afterEach(() => {
    jest.clearAllMocks();
    action$.complete();
    state$.complete();
    depsMock.latest$.complete();
  });

  describe('initMatrixEpic', () => {
    test('matrix stored setup', async () => {
      action$.next(
        matrixSetup({
          server: matrixServer,
          setup: {
            userId,
            accessToken,
            deviceId,
            displayName,
          },
        }),
      );

      const promise = initMatrixEpic(action$, state$, depsMock).pipe(first()).toPromise();

      setTimeout(() => action$.complete(), 10);

      await expect(promise).resolves.toEqual(
        matrixSetup({
          server: matrixServer,
          setup: {
            userId,
            accessToken: expect.any(String),
            deviceId: expect.any(String),
            displayName: expect.any(String),
          },
        }),
      );
      // ensure if stored setup works, servers list don't need to be fetched
      expect(fetch).not.toHaveBeenCalled();
    });

    test('matrix server config set without stored setup', async () => {
      expect.assertions(2);

      action$.next(raidenConfigUpdate({ matrixServer }));
      const promise = initMatrixEpic(action$, state$, depsMock).toPromise();
      setTimeout(() => action$.complete(), 10);

      await expect(promise).resolves.toEqual(
        matrixSetup({
          server: matrixServer,
          setup: {
            userId,
            accessToken: expect.any(String),
            deviceId: expect.any(String),
            displayName: expect.any(String),
          },
        }),
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    test('matrix server config set same as stored setup', async () => {
      [
        matrixSetup({
          server: matrixServer,
          setup: {
            userId,
            accessToken,
            deviceId,
            displayName,
          },
        }),
        raidenConfigUpdate({ matrixServer }),
      ].forEach((a) => action$.next(a));

      const promise = initMatrixEpic(action$, state$, depsMock).pipe(first()).toPromise();

      setTimeout(() => action$.complete(), 10);

      await expect(promise).resolves.toEqual(
        matrixSetup({
          server: matrixServer,
          setup: {
            userId,
            accessToken: expect.any(String),
            deviceId: expect.any(String),
            displayName: expect.any(String),
          },
        }),
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    test('matrix fetch servers list', async () => {
      const action$ = EMPTY as Observable<RaidenAction>,
        state$ = of(state);
      await expect(
        initMatrixEpic(action$, state$, depsMock).pipe(first()).toPromise(),
      ).resolves.toEqual(
        matrixSetup({
          server: `https://${matrixServer}`,
          setup: {
            userId,
            accessToken: expect.any(String),
            deviceId: expect.any(String),
            displayName: expect.any(String),
          },
        }),
      );
      expect(fetch).toHaveBeenCalledTimes(2); // list + rtt
    });

    test('matrix throws if can not fetch servers list', async () => {
      expect.assertions(2);
      const action$ = EMPTY as Observable<RaidenAction>,
        state$ = of(
          raidenReducer(
            state,
            matrixSetup({
              server: '///', // invalid server name, should suppress and try servers list
              setup: {
                userId,
                accessToken,
                deviceId,
                displayName,
              },
            }),
          ),
        );
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: jest.fn(async () => ''),
      });
      await expect(initMatrixEpic(action$, state$, depsMock).toPromise()).rejects.toThrow(
        'Could not fetch server list',
      );
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    test('matrix throws if can not contact any server from list', async () => {
      expect.assertions(2);
      const action$ = EMPTY as Observable<RaidenAction>,
        state$ = of(state);
      // mock*Once is a stack. this 'fetch' will be for the servers list
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn(async () => `- ${matrixServer}`),
      });
      // and this one for matrixRTT. 404 will reject it
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: jest.fn(async () => ''),
      });
      await expect(initMatrixEpic(action$, state$, depsMock).toPromise()).rejects.toThrow(
        ErrorCodes.TRNS_NO_MATRIX_SERVERS,
      );
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('matrixMonitorChannelPresenceEpic', () => {
    test('channelMonitored triggers matrixPresence.request', async () => {
      const action$ = of<RaidenAction>(
        channelMonitored({ id: channelId }, { tokenNetwork, partner }),
      );
      const promise = matrixMonitorChannelPresenceEpic(action$).toPromise();
      await expect(promise).resolves.toEqual(
        matrixPresence.request(undefined, { address: partner }),
      );
    });
  });

  describe('matrixShutdownEpic', () => {
    test('stopClient called on action$ completion', async () => {
      expect.assertions(3);
      expect(matrix.stopClient).not.toHaveBeenCalled();
      await expect(
        matrixShutdownEpic(EMPTY, EMPTY, depsMock).toPromise(),
      ).resolves.toBeUndefined();
      expect(matrix.stopClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('matrixMonitorPresenceEpic', () => {
    test('fails when users does not have displayName', async () => {
      expect.assertions(1);

      matrix.searchUserDirectory.mockImplementationOnce(async () => ({
        limited: false,
        results: [{ user_id: partnerUserId }],
      }));

      const promise = matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise();

      action$.next(matrixPresence.request(undefined, { address: partner }));
      setTimeout(() => action$.complete(), 10);

      await expect(promise).resolves.toEqual(
        matrixPresence.failure(expect.any(Error), { address: partner }),
      );
    });

    test('fails when users does not have valid addresses', async () => {
      expect.assertions(1);

      matrix.searchUserDirectory.mockImplementationOnce(async () => ({
        limited: false,
        results: [{ user_id: `@invalidUser:${matrixServer}`, display_name: 'display_name' }],
      }));

      const promise = matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise();

      action$.next(matrixPresence.request(undefined, { address: partner }));
      setTimeout(() => action$.complete(), 10);

      await expect(promise).resolves.toEqual(
        matrixPresence.failure(expect.any(Error), { address: partner }),
      );
    });

    test('fails when users does not have presence or unknown address', async () => {
      expect.assertions(1);

      (verifyMessage as jest.Mock).mockReturnValueOnce(token);
      matrix.searchUserDirectory.mockImplementationOnce(async () => ({
        limited: false,
        results: [{ user_id: partnerUserId, display_name: 'display_name' }],
      }));

      const promise = matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise();

      action$.next(matrixPresence.request(undefined, { address: partner }));
      setTimeout(() => action$.complete(), 10);

      await expect(promise).resolves.toEqual(
        matrixPresence.failure(expect.any(Error), { address: partner }),
      );
    });

    test('fails when verifyMessage throws', async () => {
      expect.assertions(1);

      matrix.searchUserDirectory.mockImplementationOnce(async () => ({
        limited: false,
        results: [{ user_id: partnerUserId, display_name: 'display_name' }],
      }));
      (verifyMessage as jest.Mock).mockImplementationOnce(() => {
        throw new Error('invalid signature');
      });

      const promise = matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise();

      action$.next(matrixPresence.request(undefined, { address: partner }));
      setTimeout(() => action$.complete(), 10);

      await expect(promise).resolves.toEqual(
        matrixPresence.failure(expect.any(Error), { address: partner }),
      );
    });

    test('success with previously monitored user', async () => {
      expect.assertions(1);
      const presence = matrixPresence.success(
        { userId: partnerUserId, available: false, ts: Date.now() },
        { address: partner },
      );
      action$.next(presence);

      const promise = matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise();

      action$.next(matrixPresence.request(undefined, { address: partner }));
      setTimeout(() => action$.complete(), 10);

      await expect(promise).resolves.toBe(presence);
    });

    test('success with searchUserDirectory and getUserPresence', async () => {
      expect.assertions(1);

      matrix.searchUserDirectory.mockImplementationOnce(async ({ term }) => ({
        results: [
          {
            user_id: `@${term}:${matrixServer}`,
            display_name: `${term}_display_name`,
            avatar_url: 'noDelivery,randomCap="test"',
          },
        ],
      }));

      const promise = matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise();

      action$.next(matrixPresence.request(undefined, { address: partner }));
      setTimeout(() => action$.complete(), 10);

      await expect(promise).resolves.toEqual(
        matrixPresence.success(
          {
            userId: partnerUserId,
            available: true,
            ts: expect.any(Number),
            caps: { [Capabilities.NO_DELIVERY]: true, randomCap: 'test' },
          },
          { address: partner },
        ),
      );
    });

    test('success even if some getUserPresence fails', async () => {
      expect.assertions(1);

      matrix.searchUserDirectory.mockImplementationOnce(async () => ({
        limited: false,
        results: [
          { user_id: `@${partner.toLowerCase()}.2:${matrixServer}`, display_name: '2' },
          { user_id: partnerUserId, display_name: '1' },
        ],
      }));
      matrix._http.authedRequest.mockRejectedValueOnce(new Error('Could not fetch presence'));

      const promise = matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise();

      action$.next(matrixPresence.request(undefined, { address: partner }));
      setTimeout(() => action$.complete(), 10);

      await expect(promise).resolves.toEqual(
        matrixPresence.success(
          { userId: partnerUserId, available: true, ts: expect.any(Number) },
          { address: partner },
        ),
      );
    });
  });

  describe('matrixPresenceUpdateEpic', () => {
    test('success presence update with caps', async () => {
      expect.assertions(1);
      const action$ = of(
          matrixPresence.request(undefined, { address: partner }),
          matrixPresence.success(
            { userId: partnerUserId, available: true, ts: 123 },
            { address: partner },
          ),
        ),
        state$ = of(state);

      const promise = matrixPresenceUpdateEpic(action$, state$, depsMock)
        .pipe(first())
        .toPromise();

      matrix.getProfileInfo.mockResolvedValueOnce({
        displayname: `${userId}_display_name`,
        avatar_url: `noDelivery`,
      });

      matrix.emit('event', {
        getType: () => 'm.presence',
        getSender: () => partnerUserId,
      });

      await expect(promise).resolves.toEqual(
        matrixPresence.success(
          {
            userId: partnerUserId,
            available: false,
            ts: expect.any(Number),
            caps: { [Capabilities.NO_DELIVERY]: true },
          },
          { address: partner },
        ),
      );
    });

    test('getProfileInfo error', async () => {
      expect.assertions(1);
      const action$ = of(
          matrixPresence.request(undefined, { address: partner }),
          matrixPresence.success(
            { userId: partnerUserId, available: true, ts: 123 },
            { address: partner },
          ),
        ),
        state$ = of(state);

      matrix.getProfileInfo.mockRejectedValueOnce(new Error('could not get user profile'));

      const promise = matrixPresenceUpdateEpic(action$, state$, depsMock)
        .pipe(takeUntil(timer(50)))
        .toPromise();

      matrix.emit('event', {
        getType: () => 'm.presence',
        getSender: () => partnerUserId,
      });

      await expect(promise).resolves.toBeUndefined();
    });
  });

  test('matrixUpdateCapsEpic', async () => {
    expect.assertions(8);
    action$.next(raidenConfigUpdate({ caps: { [Capabilities.NO_DELIVERY]: true } }));

    // don't call on first replayed value from config$
    await expect(
      matrixUpdateCapsEpic(action$, state$, depsMock)
        .pipe(takeUntil(timer(10)))
        .toPromise(),
    ).resolves.toBeUndefined();
    expect(matrix.setAvatarUrl).not.toHaveBeenCalled();

    // promise failure doesn't error observable
    matrix.setAvatarUrl.mockRejectedValueOnce(new Error('failed'));
    let promise = matrixUpdateCapsEpic(action$, state$, depsMock)
      .pipe(takeUntil(timer(10)))
      .toPromise();
    action$.next(
      raidenConfigUpdate({
        caps: { [Capabilities.NO_DELIVERY]: true, [Capabilities.WEBRTC]: true },
      }),
    );
    await expect(promise).resolves.toBeUndefined();
    expect(matrix.setAvatarUrl).toHaveBeenCalledTimes(1);
    expect(matrix.setAvatarUrl).toHaveBeenCalledWith('noDelivery,webRTC');

    promise = matrixUpdateCapsEpic(action$, state$, depsMock).toPromise();
    action$.next(
      raidenConfigUpdate({
        caps: { [Capabilities.NO_RECEIVE]: true, customCap: 'abc' },
      }),
    );
    setTimeout(() => action$.complete(), 10);
    await expect(promise).resolves.toBeUndefined();
    expect(matrix.setAvatarUrl).toHaveBeenCalledTimes(2);
    expect(matrix.setAvatarUrl).toHaveBeenCalledWith('noReceive,customCap="abc"');
  });

  describe('matrixCreateRoomEpic', () => {
    test('success: concurrent messages create single room', async () => {
      expect.assertions(2);

      const promise = matrixCreateRoomEpic(action$, state$, depsMock)
        .pipe(
          // update state with action, to ensure serial handling knows about already created room
          tap((action) => state$.next(raidenReducer(state, action))),
          takeUntil(timer(50)),
        )
        .toPromise();

      [
        messageSend.request({ message: 'message1' }, { address: partner, msgId: 'message1' }),
        messageSend.request({ message: 'message2' }, { address: partner, msgId: 'message2' }),
        messageSend.request({ message: 'message3' }, { address: partner, msgId: 'message3' }),
        messageSend.request({ message: 'message4' }, { address: partner, msgId: 'message4' }),
        messageSend.request({ message: 'message5' }, { address: partner, msgId: 'message5' }),
        matrixPresence.success(
          { userId: partnerUserId, available: true, ts: 123 },
          { address: partner },
        ),
      ].forEach((a) => action$.next(a));

      action$.complete();

      await expect(promise).resolves.toEqual(
        matrixRoom(
          { roomId: expect.stringMatching(new RegExp(`^!.*:${matrixServer}$`)) },
          { address: partner },
        ),
      );
      // ensure multiple concurrent messages only create a single room
      expect(matrix.createRoom).toHaveBeenCalledTimes(1);
    });
  });

  describe('matrixInviteEpic', () => {
    test('do not invite if there is no room for user', async () => {
      expect.assertions(2);

      const promise = matrixInviteEpic(action$, state$, depsMock).toPromise();

      action$.next(
        matrixPresence.success(
          { userId: partnerUserId, available: true, ts: 123 },
          { address: partner },
        ),
      );
      action$.complete();

      await expect(promise).resolves.toBeUndefined();
      expect(matrix.invite).not.toHaveBeenCalled();
    });

    test('invite if there is room for user', () => {
      expect.assertions(2);
      const roomId = partnerRoomId;

      action$.next(matrixRoom({ roomId }, { address: partner }));

      matrix.invite.mockResolvedValueOnce(Promise.resolve());
      // partner joins when they're invited the second time
      matrix.invite.mockImplementationOnce(async () => {
        matrix.emit(
          'RoomMember.membership',
          {},
          { roomId, userId: partnerUserId, membership: 'join' },
        );
      });

      // epic needs to wait for the room to become available
      matrix.getRoom.mockReturnValueOnce(null);

      const sub = matrixInviteEpic(action$, state$, depsMock).subscribe();

      action$.next(
        matrixPresence.success(
          { userId: partnerUserId, available: true, ts: 123 },
          { address: partner },
        ),
      );

      matrix.emit('Room', { roomId, getMember: jest.fn(() => ({ membership: 'leave' })) });
      matrix.emit(
        'RoomMember.membership',
        {},
        { roomId, userId: partnerUserId, membership: 'leave' },
      );

      expect(matrix.invite).toHaveBeenCalledTimes(2);
      expect(matrix.invite).toHaveBeenCalledWith(roomId, partnerUserId);

      sub.unsubscribe();
    });
  });

  describe('matrixHandleInvitesEpic', () => {
    test('accept & join from previous presence', async () => {
      expect.assertions(3);
      const roomId = partnerRoomId;

      const promise = matrixHandleInvitesEpic(action$, state$, depsMock).pipe(first()).toPromise();

      action$.next(
        matrixPresence.success(
          { userId: partnerUserId, available: true, ts: 123 },
          { address: partner },
        ),
      );

      matrix.emit(
        'RoomMember.membership',
        { getSender: () => partnerUserId },
        { roomId, userId, membership: 'invite' },
      );

      await expect(promise).resolves.toEqual(matrixRoom({ roomId }, { address: partner }));
      expect(matrix.joinRoom).toHaveBeenCalledTimes(1);
      expect(matrix.joinRoom).toHaveBeenCalledWith(
        roomId,
        expect.objectContaining({ syncRoom: true }),
      );
    });

    test('accept & join from late presence', async () => {
      expect.assertions(3);
      const roomId = partnerRoomId;

      const promise = matrixHandleInvitesEpic(action$, state$, depsMock).pipe(first()).toPromise();

      matrix.emit(
        'RoomMember.membership',
        { getSender: () => partnerUserId },
        { roomId, userId, membership: 'invite' },
      );

      action$.next(
        matrixPresence.success(
          { userId: partnerUserId, available: true, ts: Date.now() },
          { address: partner },
        ),
      );
      action$.complete();

      await expect(promise).resolves.toEqual(matrixRoom({ roomId }, { address: partner }));
      expect(matrix.joinRoom).toHaveBeenCalledTimes(1);
      expect(matrix.joinRoom).toHaveBeenCalledWith(
        roomId,
        expect.objectContaining({ syncRoom: true }),
      );
    });

    test('do not accept invites from non-monitored peers', async () => {
      expect.assertions(2);
      const action$ = of<RaidenAction>(),
        state$ = of(state),
        roomId = partnerRoomId;

      const promise = matrixHandleInvitesEpic(action$, state$, depsMock)
        .pipe(first(), takeUntil(timer(100)))
        .toPromise();

      matrix.emit(
        'RoomMember.membership',
        { getSender: () => partnerUserId },
        { roomId, userId, membership: 'invite' },
      );

      await expect(promise).resolves.toBeUndefined();
      expect(matrix.joinRoom).not.toHaveBeenCalled();
    });
  });

  describe('matrixLeaveExcessRoomsEpic', () => {
    test('leave rooms behind threshold', async () => {
      expect.assertions(3);
      const roomId = partnerRoomId,
        action = matrixRoom(
          { roomId: `!frontRoomId_for_partner:${matrixServer}` },
          { address: partner },
        ),
        action$ = of(action),
        state$ = of(
          [
            matrixRoom({ roomId }, { address: partner }),
            matrixRoom({ roomId: `!roomId2:${matrixServer}` }, { address: partner }),
            matrixRoom({ roomId: `!roomId3:${matrixServer}` }, { address: partner }),
            action,
          ].reduce(raidenReducer, state),
        );

      const promise = matrixLeaveExcessRoomsEpic(action$, state$, depsMock).toPromise();

      await expect(promise).resolves.toEqual(matrixRoomLeave({ roomId }, { address: partner }));
      expect(matrix.leave).toHaveBeenCalledTimes(1);
      expect(matrix.leave).toHaveBeenCalledWith(roomId);
    });
  });

  describe('matrixLeaveUnknownRoomsEpic', () => {
    test('leave unknown rooms', async () => {
      expect.assertions(3);

      const roomId = `!unknownRoomId:${matrixServer}`,
        state$ = of(state);

      const sub = matrixLeaveUnknownRoomsEpic(EMPTY, state$, depsMock).subscribe();

      matrix.emit('Room', {
        roomId,
        getCanonicalAlias: jest.fn(),
        getAliases: jest.fn(() => []),
      });

      await sleep();

      // we should wait a little before leaving rooms
      expect(matrix.leave).not.toHaveBeenCalled();

      await sleep(500);

      expect(matrix.leave).toHaveBeenCalledTimes(1);
      expect(matrix.leave).toHaveBeenCalledWith(roomId);

      sub.unsubscribe();
    });

    test('do not leave global room', async () => {
      expect.assertions(2);

      const roomId = `!discoveryRoomId:${matrixServer}`,
        state$ = of(state),
        roomAlias = `#raiden_${depsMock.network.name}_discovery:${matrixServer}`;

      const sub = matrixLeaveUnknownRoomsEpic(EMPTY, state$, depsMock).subscribe();

      matrix.emit('Room', {
        roomId,
        getCanonicalAlias: jest.fn(),
        getAliases: jest.fn(() => [roomAlias]),
      });

      await sleep();

      // we should wait a little before leaving rooms
      expect(matrix.leave).not.toHaveBeenCalled();

      await sleep(500);

      // even after some time, discovery room isn't left
      expect(matrix.leave).not.toHaveBeenCalled();

      sub.unsubscribe();
    });

    test('do not leave peers rooms', async () => {
      expect.assertions(2);

      const roomId = partnerRoomId,
        state$ = of(raidenReducer(state, matrixRoom({ roomId }, { address: partner })));

      const sub = matrixLeaveUnknownRoomsEpic(EMPTY, state$, depsMock).subscribe();

      matrix.emit('Room', {
        roomId,
        getCanonicalAlias: jest.fn(),
        getAliases: jest.fn(() => []),
      });

      await sleep();

      // we should wait a little before leaving rooms
      expect(matrix.leave).not.toHaveBeenCalled();

      await sleep(500);

      // even after some time, partner's room isn't left
      expect(matrix.leave).not.toHaveBeenCalled();

      sub.unsubscribe();
    });
  });

  describe('matrixCleanLeftRoomsEpic', () => {
    test('clean left rooms', async () => {
      expect.assertions(1);

      const roomId = partnerRoomId,
        state$ = of(raidenReducer(state, matrixRoom({ roomId }, { address: partner })));

      const promise = matrixCleanLeftRoomsEpic(EMPTY, state$, depsMock).pipe(first()).toPromise();

      matrix.emit('Room.myMembership', { roomId }, 'leave');

      await expect(promise).resolves.toEqual(matrixRoomLeave({ roomId }, { address: partner }));
    });
  });

  describe('matrixCleanMissingRoomsEpic', () => {
    test('clean missing rooms', async () => {
      expect.assertions(1);

      const roomId = partnerRoomId;
      const roomId2 = `!partnerRoomId2:${matrixServer}`;

      matrix.getRoom.mockReturnValueOnce(null);
      matrix.getRoom.mockReturnValueOnce({
        roomId,
        name: roomId,
        getMember: jest.fn(),
        getJoinedMembers: jest.fn(),
        getCanonicalAlias: jest.fn(() => roomId),
        getAliases: jest.fn(() => []),
      } as any);

      action$.next(raidenConfigUpdate({ httpTimeout: 10 }));
      action$.next(
        matrixSetup({
          server: matrixServer,
          setup: { userId, deviceId, accessToken, displayName },
        }),
      );
      action$.next(matrixRoom({ roomId }, { address: partner }));
      action$.next(matrixRoom({ roomId: roomId2 }, { address: partner }));

      const promise = matrixCleanMissingRoomsEpic(action$, state$, depsMock)
        .pipe(toArray())
        .toPromise();

      action$.next(raidenConfigUpdate({ httpTimeout: 10 }));

      setTimeout(() => action$.complete(), 50);

      await expect(promise).resolves.toEqual([
        matrixRoomLeave({ roomId: roomId2 }, { address: partner }),
      ]);
    });
  });

  describe('matrixMessageSendEpic', () => {
    beforeEach(() => action$.next(raidenConfigUpdate({ httpTimeout: 30 })));

    test('send: all needed parts in place, errors once but retries successfully', async () => {
      expect.assertions(3);

      const roomId = partnerRoomId,
        message = processed,
        signed = await signMessage(depsMock.signer, message);

      action$.next(matrixRoom({ roomId }, { address: partner }));

      matrix.getRoom.mockReturnValueOnce({
        roomId,
        name: roomId,
        getMember: jest.fn(
          (userId) =>
            ({
              roomId,
              userId,
              name: userId,
              membership: 'join',
              user: null,
            } as any),
        ),
        getJoinedMembers: jest.fn(() => []),
        getCanonicalAlias: jest.fn(() => roomId),
        getAliases: jest.fn(() => []),
        currentState: {
          roomId,
          setStateEvents: jest.fn(),
          members: {},
        } as any,
      } as any);
      matrix.sendEvent.mockRejectedValueOnce(new Error('Failed'));

      const promise = matrixMessageSendEpic(action$, state$, depsMock).toPromise();

      [
        messageSend.request(
          { message: signed },
          { address: partner, msgId: signed.message_identifier.toString() },
        ),
        matrixPresence.success(
          { userId: partnerUserId, available: true, ts: Date.now() },
          { address: partner },
        ),
      ].forEach((a) => action$.next(a));
      setTimeout(() => action$.complete(), 100);

      await expect(promise).resolves.toMatchObject(
        messageSend.success(expect.anything(), {
          address: partner,
          msgId: signed.message_identifier.toString(),
        }),
      );
      expect(matrix.sendEvent).toHaveBeenCalledTimes(2);
      expect(matrix.sendEvent).toHaveBeenCalledWith(
        roomId,
        'm.room.message',
        expect.objectContaining({ body: expect.stringMatching('"Processed"'), msgtype: 'm.text' }),
        expect.anything(),
      );
    });

    test('send: Room appears late, user joins later', async () => {
      expect.assertions(3);

      const roomId = partnerRoomId,
        message = 'test message';

      action$.next(matrixRoom({ roomId }, { address: partner }));

      matrix.getRoom.mockReturnValueOnce(null);

      const sub = matrixMessageSendEpic(action$, state$, depsMock).subscribe();

      [
        matrixPresence.success(
          { userId: partnerUserId, available: true, ts: Date.now() },
          { address: partner },
        ),
        messageSend.request({ message }, { address: partner, msgId: message }),
      ].forEach((a) => action$.next(a));

      expect(matrix.sendEvent).not.toHaveBeenCalled();

      // a wild Room appears
      matrix.emit('Room', {
        roomId,
        name: roomId,
        getMember: jest.fn(),
        getJoinedMembers: jest.fn(),
        getCanonicalAlias: jest.fn(() => roomId),
        getAliases: jest.fn(() => []),
      });

      // user joins later
      matrix.emit(
        'RoomMember.membership',
        {},
        { roomId, userId: partnerUserId, name: partnerUserId, membership: 'join' },
      );

      expect(matrix.sendEvent).toHaveBeenCalledTimes(1);
      expect(matrix.sendEvent).toHaveBeenCalledWith(
        roomId,
        'm.room.message',
        expect.objectContaining({ body: message, msgtype: 'm.text' }),
        expect.anything(),
      );

      sub.unsubscribe();
    });

    test('sendEvent fails', async () => {
      expect.assertions(3);

      const roomId = partnerRoomId,
        message = 'Hello world!';

      action$.next(matrixRoom({ roomId }, { address: partner }));

      matrix.getRoom.mockReturnValueOnce({
        roomId,
        name: roomId,
        getMember: jest.fn(
          (userId) =>
            ({
              roomId,
              userId,
              name: userId,
              membership: 'join',
              user: null,
            } as any),
        ),
        getJoinedMembers: jest.fn(() => []),
        getCanonicalAlias: jest.fn(() => roomId),
        getAliases: jest.fn(() => []),
        currentState: {
          roomId,
          setStateEvents: jest.fn(),
          members: {},
        } as any,
      } as any);
      matrix.sendEvent.mockRejectedValueOnce(new Error('Failed 1'));
      matrix.sendEvent.mockRejectedValueOnce(new Error('Failed 2'));
      matrix.sendEvent.mockRejectedValueOnce(new Error('Failed 3'));

      const promise = matrixMessageSendEpic(action$, state$, depsMock).toPromise();

      [
        matrixPresence.success(
          { userId: partnerUserId, available: true, ts: Date.now() },
          { address: partner },
        ),
        messageSend.request({ message }, { address: partner, msgId: message }),
      ].forEach((a) => action$.next(a));
      setTimeout(() => action$.complete(), 100);

      await expect(promise).resolves.toMatchObject(
        messageSend.failure(expect.objectContaining({ message: 'Failed 3' }), {
          address: partner,
          msgId: message,
        }),
      );
      expect(matrix.sendEvent).toHaveBeenCalledTimes(3);
      expect(matrix.sendEvent).toHaveBeenCalledWith(
        roomId,
        'm.room.message',
        expect.objectContaining({ body: message, msgtype: 'm.text' }),
        expect.anything(),
      );
    });
  });

  describe('matrixMessageReceivedEpic', () => {
    beforeEach(() => {
      action$.next(
        matrixSetup({
          server: matrixServer,
          setup: { userId, deviceId, accessToken, displayName },
        }),
      );
    });

    test('receive: success on late presence and late room', async () => {
      expect.assertions(1);

      const roomId = partnerRoomId,
        message = 'test message';

      const promise = matrixMessageReceivedEpic(action$, state$, depsMock)
        .pipe(first())
        .toPromise();

      matrix.emit(
        'Room.timeline',
        {
          getType: () => 'm.room.message',
          getSender: () => partnerUserId,
          event: {
            content: { msgtype: 'm.text', body: message },
            origin_server_ts: 123,
          },
        },
        { roomId, getCanonicalAlias: jest.fn(), getAliases: jest.fn(() => []) },
      );

      // actions sees presence update for partner only later
      action$.next(
        matrixPresence.success(
          { userId: partnerUserId, available: true, ts: Date.now() },
          { address: partner },
        ),
      );
      // state includes room for partner only later
      action$.next(matrixRoom({ roomId }, { address: partner }));

      // then it resolves
      await expect(promise).resolves.toEqual(
        messageReceived(
          {
            text: message,
            ts: expect.any(Number),
            userId: partnerUserId,
            roomId,
          },
          { address: partner },
        ),
      );
    });

    test('receive: decode signed message', async () => {
      expect.assertions(1);

      const roomId = partnerRoomId,
        signed = await signMessage(partnerSigner, processed),
        message = encodeJsonMessage(signed);
      action$.next(
        matrixPresence.success(
          { userId: partnerUserId, available: true, ts: Date.now() },
          { address: partner },
        ),
      );
      action$.next(matrixRoom({ roomId }, { address: partner }));

      const promise = matrixMessageReceivedEpic(action$, state$, depsMock)
        .pipe(first())
        .toPromise();

      matrix.emit(
        'Room.timeline',
        {
          getType: () => 'm.room.message',
          getSender: () => partnerUserId,
          event: {
            content: { msgtype: 'm.text', body: message },
            origin_server_ts: 123,
          },
        },
        { roomId, getCanonicalAlias: jest.fn(), getAliases: jest.fn(() => []) },
      );

      // then it resolves
      await expect(promise).resolves.toEqual(
        messageReceived(
          {
            text: message,
            message: {
              type: MessageType.PROCESSED,
              message_identifier: expect.any(BigNumber),
              signature: expect.any(String),
            },
            ts: expect.any(Number),
            userId: partnerUserId,
            roomId,
          },
          { address: partner },
        ),
      );
    });

    test("receive: messages from wrong sender aren't decoded", async () => {
      expect.assertions(1);

      const roomId = partnerRoomId,
        // signed by ourselves
        signed = await signMessage(depsMock.signer, processed),
        message = encodeJsonMessage(signed);

      action$.next(
        matrixPresence.success(
          { userId: partnerUserId, available: true, ts: Date.now() },
          { address: partner },
        ),
      );
      action$.next(matrixRoom({ roomId }, { address: partner }));

      const promise = matrixMessageReceivedEpic(action$, state$, depsMock)
        .pipe(first())
        .toPromise();

      matrix.emit(
        'Room.timeline',
        {
          getType: () => 'm.room.message',
          getSender: () => partnerUserId,
          event: {
            content: { msgtype: 'm.text', body: message },
            origin_server_ts: 123,
          },
        },
        { roomId, getCanonicalAlias: jest.fn(), getAliases: jest.fn(() => []) },
      );

      // then it resolves
      await expect(promise).resolves.toEqual(
        messageReceived(
          {
            text: message,
            message: undefined,
            ts: expect.any(Number),
            userId: partnerUserId,
            roomId,
          },
          { address: partner },
        ),
      );
    });
  });

  describe('matrixMessageReceivedUpdateRoomEpic', () => {
    test('messageReceived on second room emits matrixRoom', async () => {
      expect.assertions(1);

      const roomId = partnerRoomId,
        action$ = of(
          messageReceived(
            { text: 'test message', ts: 123, userId: partnerUserId, roomId },
            { address: partner },
          ),
        ),
        state$ = of(
          [
            matrixRoom({ roomId }, { address: partner }),
            // newRoom becomes first 'choice', roomId goes second
            matrixRoom({ roomId: `!newRoomId_for_partner:${matrixServer}` }, { address: partner }),
          ].reduce(raidenReducer, state),
        );

      await expect(
        matrixMessageReceivedUpdateRoomEpic(action$, state$).toPromise(),
      ).resolves.toEqual(matrixRoom({ roomId }, { address: partner }));
    });
  });

  describe('deliveredEpic', () => {
    test('success with cached', async () => {
      expect.assertions(4);

      const message: Signed<Processed> = {
          type: MessageType.PROCESSED,
          message_identifier: makeMessageId(),
          signature: makeSignature(),
        },
        roomId = partnerRoomId,
        action = messageReceived(
          {
            text: encodeJsonMessage(message),
            message,
            ts: 123,
            userId: partnerUserId,
            roomId,
          },
          { address: partner },
        );

      // set status as available in latest$.presences
      action$.next(
        matrixPresence.success(
          { userId: partnerUserId, available: true, ts: Date.now() },
          { address: partner },
        ),
      );

      const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');
      const promise = deliveredEpic(of(action, action), EMPTY, depsMock)
        .pipe(toArray())
        .toPromise();

      const output = await promise;
      expect(output).toHaveLength(2);
      expect(output[1]).toEqual(
        messageSend.request(
          {
            message: {
              type: MessageType.DELIVERED,
              delivered_message_identifier: message.message_identifier,
              signature: expect.any(String),
            },
          },
          { address: partner, msgId: message.message_identifier.toString() },
        ),
      );
      expect(output[0].payload.message).toBe(output[1].payload.message); // same cached object

      expect(signerSpy).toHaveBeenCalledTimes(1);
      signerSpy.mockRestore();
    });

    test('skip if partner supports Capabilities.NO_DELIVERY', async () => {
      expect.assertions(2);

      const message: Signed<Processed> = {
          type: MessageType.PROCESSED,
          message_identifier: makeMessageId(),
          signature: makeSignature(),
        },
        roomId = partnerRoomId,
        action = messageReceived(
          {
            text: encodeJsonMessage(message),
            message,
            ts: 123,
            userId: partnerUserId,
            roomId,
          },
          { address: partner },
        );

      // set status as available in latest$.presences
      action$.next(
        matrixPresence.success(
          {
            userId: partnerUserId,
            available: true,
            ts: Date.now(),
            caps: { [Capabilities.NO_DELIVERY]: true },
          },
          { address: partner },
        ),
      );

      const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');
      const promise = deliveredEpic(of(action, action), EMPTY, depsMock).toPromise();

      await expect(promise).resolves.toBeUndefined();
      expect(signerSpy).toHaveBeenCalledTimes(0);
      signerSpy.mockRestore();
    });

    test('do not reply if not message type which should be replied', async () => {
      expect.assertions(2);

      // Delivered messages aren't in the set of messages which get replied with a Delivered
      const message: Signed<Delivered> = {
          type: MessageType.DELIVERED,
          delivered_message_identifier: makeMessageId(),
          signature: makeSignature(),
        },
        roomId = partnerRoomId,
        action$ = of(
          messageReceived(
            {
              text: encodeJsonMessage(message),
              message,
              ts: 123,
              userId: partnerUserId,
              roomId,
            },
            { address: partner },
          ),
        );

      const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');
      const promise = deliveredEpic(action$, EMPTY, depsMock).toPromise();

      await expect(promise).resolves.toBeUndefined();
      expect(signerSpy).toHaveBeenCalledTimes(0);
      signerSpy.mockRestore();
    });
  });

  test('matrixMessageGlobalSendEpic', async () => {
    expect.assertions(8);

    const message = await signMessage(partnerSigner, processed),
      text = encodeJsonMessage(message),
      state$ = of(
        [
          matrixSetup({
            server: matrixServer,
            setup: { userId, deviceId, accessToken, displayName },
          }),
        ].reduce(raidenReducer, state),
      );

    await expect(
      matrixMessageGlobalSendEpic(
        of(messageGlobalSend({ message }, { roomName: 'unknown_global_room' })),
        state$,
        depsMock,
      ).toPromise(),
    ).resolves.toBeUndefined();

    expect(matrix.sendEvent).toHaveBeenCalledTimes(0);

    let discoveryRoom!: string;
    depsMock.latest$
      .pipe(first())
      .subscribe(({ config }) => (discoveryRoom = config.discoveryRoom!));

    await expect(
      matrixMessageGlobalSendEpic(
        of(messageGlobalSend({ message }, { roomName: discoveryRoom })),
        state$,
        depsMock,
      ).toPromise(),
    ).resolves.toBeUndefined();

    expect(matrix.sendEvent).toHaveBeenCalledTimes(1);
    expect(matrix.sendEvent).toHaveBeenCalledWith(
      expect.any(String),
      'm.room.message',
      expect.objectContaining({ body: text, msgtype: 'm.text' }),
      expect.anything(),
    );

    // test graceful failure
    matrix.sendEvent.mockClear();
    matrix.sendEvent.mockRejectedValueOnce(new Error('Failed'));

    await expect(
      matrixMessageGlobalSendEpic(
        of(messageGlobalSend({ message }, { roomName: discoveryRoom })),
        state$,
        depsMock,
      ).toPromise(),
    ).resolves.toBeUndefined();

    expect(matrix.sendEvent).toHaveBeenCalledTimes(1);
    expect(matrix.sendEvent).toHaveBeenCalledWith(
      expect.any(String),
      'm.room.message',
      expect.objectContaining({ body: text, msgtype: 'm.text' }),
      expect.anything(),
    );
  });

  describe('rtcConnectEpic', () => {
    const createPartnerPresence = (available: boolean, webRtcCapable: boolean) =>
      matrixPresence.success(
        {
          userId: partnerUserId,
          available,
          ts: Date.now(),
          caps: { [Capabilities.WEBRTC]: webRtcCapable },
        },
        { address: partner },
      );

    let rtcConnection: ReturnType<typeof mockRTC>['rtcConnection'];
    let rtcDataChannel: ReturnType<typeof mockRTC>['rtcDataChannel'];
    let RTCPeerConnection: ReturnType<typeof mockRTC>['RTCPeerConnection'];
    beforeEach(() => {
      ({ rtcConnection, rtcDataChannel, RTCPeerConnection } = mockRTC());
      action$.next(
        raidenConfigUpdate({
          httpTimeout: 300,
          caps: { [Capabilities.NO_DELIVERY]: true, [Capabilities.WEBRTC]: true },
        }),
      );
      matrix.getRoom.mockImplementation(
        () =>
          ({
            roomId: partnerRoomId,
            name: partnerRoomId,
            getMember: jest.fn(() => ({
              membership: 'join',
              roomId: partnerRoomId,
              userId: partnerUserId,
            })),
            getJoinedMembers: jest.fn(),
            getCanonicalAlias: jest.fn(() => partnerRoomId),
            getAliases: jest.fn(() => []),
          } as any),
      );
    });
    afterEach(() => {
      RTCPeerConnection.mockRestore();
    });

    test('skip if no webrtc capability exists', async () => {
      const promise = rtcConnectEpic(action$, state$, depsMock).toPromise();
      action$.next(createPartnerPresence(false, false));
      action$.next(createPartnerPresence(true, false));
      setTimeout(() => action$.complete(), 100);

      await expect(promise).resolves.toBeUndefined();
    });

    test('reset data channel if user goes offline in matrix', async () => {
      const promise = rtcConnectEpic(action$, state$, depsMock).toPromise();
      action$.next(createPartnerPresence(true, true));
      action$.next(createPartnerPresence(false, true));
      setTimeout(() => action$.complete(), 100);

      await expect(promise).resolves.toEqual({
        meta: { address: partner },
        payload: undefined,
        type: 'rtc/channel',
      });
    });

    test('set up caller data channel and waits for partner to join room', async () => {
      const promise = rtcConnectEpic(action$, state$, depsMock).toPromise();
      action$.next(createPartnerPresence(true, true));
      action$.next(matrixRoom({ roomId: userId }, { address: partner }));
      action$.next(createPartnerPresence(false, true));
      setTimeout(() => action$.complete(), 100);

      await expect(promise).resolves.toEqual({
        meta: { address: partner },
        payload: undefined,
        type: 'rtc/channel',
      });
    });

    test('success callee, receive message & channel error', async () => {
      expect.assertions(2);

      // change partner to one with smaller address, to be the caller
      partner = '0x0000000000000000000000000000000000000088' as Address;
      partnerUserId = `@${partner.toLowerCase()}:${matrixServer}`;

      const promise = rtcConnectEpic(action$, state$, depsMock)
        .pipe(takeUntil(timer(1e3)), toArray())
        .toPromise();

      const msg = '{"type":"Delivered","delivered_message_identifier":"123456"}';

      setTimeout(() => {
        matrix.emit(
          'Room.timeline',
          {
            getType: () => 'm.room.message',
            getSender: () => partnerUserId,
            getContent: () => ({
              msgtype: 'm.notice',
              body: jsonStringify({
                type: 'offer',
                call_id: `${partner}|${depsMock.address}`,
                sdp: 'offerSdp',
              }),
            }),
            getAge: () => 1,
          },
          null,
        );
      }, 5);
      setTimeout(() => {
        rtcConnection.emit('datachannel', { channel: rtcDataChannel });
      }, 15);
      setTimeout(() => {
        Object.assign(rtcDataChannel, { readyState: 'open' });
        rtcDataChannel.emit('open', true);
        rtcDataChannel.emit('message', { data: msg });
      }, 20);
      setTimeout(() => {
        Object.assign(rtcDataChannel, { readyState: 'closed' });
        rtcDataChannel.emit('error', { error: new Error('errored!') });
        action$.next(
          matrixPresence.success(
            {
              userId: partnerUserId,
              available: false,
              ts: Date.now(),
            },
            { address: partner },
          ),
        );
      }, 50);

      action$.next(matrixRoom({ roomId: partnerRoomId }, { address: partner }));
      action$.next(
        matrixPresence.success(
          {
            userId: partnerUserId,
            available: true,
            ts: Date.now(),
            caps: { [Capabilities.WEBRTC]: true },
          },
          { address: partner },
        ),
      );

      await expect(promise).resolves.toEqual(
        expect.arrayContaining([
          rtcChannel(rtcDataChannel, { address: partner }),
          messageReceived(
            {
              text: expect.any(String),
              ts: expect.any(Number),
              message: expect.objectContaining({ type: MessageType.DELIVERED }),
              userId: partnerUserId,
              roomId: undefined,
            },
            { address: partner },
          ),
        ]),
      );

      expect(matrix.sendEvent).toHaveBeenCalledWith(
        partnerRoomId,
        'm.room.message',
        expect.objectContaining({
          msgtype: 'm.notice',
          body: expect.stringMatching(/"type":\s*"answer"/),
        }),
        expect.anything(),
      );
    });

    test('success caller & candidates', async () => {
      expect.assertions(4);

      // change partner to one with higher address, to be the callee
      partner = '0xFffFfFFF00000000000000000000000000000088' as Address;
      partnerUserId = `@${partner.toLowerCase()}:${matrixServer}`;

      const promise = rtcConnectEpic(action$, state$, depsMock)
        .pipe(takeUntil(timer(200)), toArray())
        .toPromise();

      matrix.sendEvent.mockImplementation(async ({}, type: string, content: any) => {
        if (type !== 'm.room.message' || content?.msgtype !== 'm.notice') return;
        const body = jsonParse(content.body);
        setTimeout(() => {
          matrix.emit(
            'Room.timeline',
            {
              getType: () => 'm.room.message',
              getSender: () => partnerUserId,
              getContent: () => ({
                msgtype: 'm.notice',
                body: jsonStringify({
                  type: 'candidates',
                  call_id: body.call_id,
                  candidates: ['partnerCandidateFail', 'partnerCandidate'],
                }),
              }),
              getAge: () => 1,
            },
            null,
          );
          // emit 'icecandidate' to be sent to partner
          rtcConnection.emit('icecandidate', { candidate: 'myCandidate' });
          rtcConnection.emit('icecandidate', { candidate: null });
        }, 10);

        setTimeout(() => {
          matrix.emit(
            'Room.timeline',
            {
              getType: () => 'm.room.message',
              getSender: () => partnerUserId,
              getContent: () => ({
                msgtype: 'm.notice',
                body: jsonStringify({
                  type: 'answer',
                  call_id: body.call_id,
                  sdp: 'answerSdp',
                }),
              }),
              getAge: () => 1,
            },
            null,
          );
          Object.assign(rtcDataChannel, { readyState: 'open' });
          rtcDataChannel.emit('open', true);
        }, 40);
        setTimeout(() => {
          rtcDataChannel.emit('close', true);
        }, 70);
      });
      rtcConnection.addIceCandidate.mockRejectedValueOnce(new Error('addIceCandidate failed'));

      action$.next(matrixRoom({ roomId: partnerRoomId }, { address: partner }));
      action$.next(
        matrixPresence.success(
          {
            userId: partnerUserId,
            available: true,
            ts: Date.now(),
            caps: { [Capabilities.WEBRTC]: true },
          },
          { address: partner },
        ),
      );

      await expect(promise).resolves.toEqual(
        expect.arrayContaining([
          rtcChannel(rtcDataChannel, { address: partner }),
          rtcChannel(undefined, { address: partner }),
        ]),
      );

      expect(matrix.sendEvent).toHaveBeenCalledWith(
        partnerRoomId,
        'm.room.message',
        expect.objectContaining({
          msgtype: 'm.notice',
          body: expect.stringMatching(/"type":\s*"offer"/),
        }),
        expect.anything(),
      );

      // assert candidates
      expect(rtcConnection.addIceCandidate).toHaveBeenCalledWith('partnerCandidate');
      expect(matrix.sendEvent).toHaveBeenCalledWith(
        partnerRoomId,
        'm.room.message',
        expect.objectContaining({
          msgtype: 'm.notice',
          body: expect.stringMatching(/"type":\s*"candidates"/),
        }),
        expect.anything(),
      );
    });
  });
});
