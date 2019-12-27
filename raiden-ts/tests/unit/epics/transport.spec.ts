/* eslint-disable @typescript-eslint/no-explicit-any,@typescript-eslint/camelcase */
jest.mock('matrix-js-sdk');

import { createClient } from 'matrix-js-sdk';

import { patchVerifyMessage } from '../patches';
patchVerifyMessage();

import { BehaviorSubject, of, timer, EMPTY, Subject, Observable } from 'rxjs';
import { first, tap, takeUntil, toArray, delay } from 'rxjs/operators';
import { fakeSchedulers } from 'rxjs-marbles/jest';
import { verifyMessage, BigNumber } from 'ethers/utils';

import { RaidenAction } from 'raiden-ts/actions';
import { raidenReducer } from 'raiden-ts/reducer';
import { RaidenState } from 'raiden-ts/state';
import { channelMonitor } from 'raiden-ts/channels/actions';
import {
  matrixPresence,
  matrixRoom,
  matrixSetup,
  matrixRoomLeave,
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
} from 'raiden-ts/transport/epics';
import { MessageType, Delivered } from 'raiden-ts/messages/types';
import { makeMessageId } from 'raiden-ts/transfers/utils';
import { encodeJsonMessage, signMessage } from 'raiden-ts/messages/utils';

import { epicFixtures } from '../fixtures';
import { raidenEpicDeps } from '../mocks';

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
    processed: ReturnType<typeof epicFixtures>['processed'];

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
    } = epicFixtures(depsMock));
    depsMock.matrix$.next(matrix);
    depsMock.matrix$.complete();

    (createClient as jest.Mock).mockReturnValue(matrix);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initMatrixEpic', () => {
    test('matrix stored setup', async () => {
      const action$ = EMPTY as Observable<RaidenAction>,
        state$ = of(
          raidenReducer(
            state,
            matrixSetup({
              server: matrixServer,
              setup: {
                userId,
                accessToken,
                deviceId,
                displayName,
              },
            }),
          ),
        );

      await expect(
        initMatrixEpic(action$, state$, depsMock)
          .pipe(first())
          .toPromise(),
      ).resolves.toEqual(
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
      const action$ = EMPTY as Observable<RaidenAction>,
        state$ = of(state);

      depsMock.latest$.pipe(first()).subscribe(l => {
        const state = { ...l.state, config: { ...l.state.config, matrixServer } };
        depsMock.latest$.next({ ...l, state, config: state.config });
      });

      await expect(
        initMatrixEpic(action$, state$, depsMock)
          .pipe(first())
          .toPromise(),
      ).resolves.toEqual(
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
      const action$ = EMPTY as Observable<RaidenAction>,
        state$ = of(
          raidenReducer(
            state,
            matrixSetup({
              server: matrixServer,
              setup: {
                userId,
                accessToken,
                deviceId,
                displayName,
              },
            }),
          ),
        );

      // set config
      depsMock.latest$.pipe(first()).subscribe(l => {
        const state = { ...l.state, config: { ...l.state.config, matrixServer } };
        depsMock.latest$.next({ ...l, state, config: state.config });
      });

      await expect(
        initMatrixEpic(action$, state$, depsMock)
          .pipe(first())
          .toPromise(),
      ).resolves.toEqual(
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
        initMatrixEpic(action$, state$, depsMock)
          .pipe(first())
          .toPromise(),
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
        'Could not contact any matrix servers',
      );
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('matrixMonitorChannelPresenceEpic', () => {
    test('channelMonitor triggers matrixPresence.request', async () => {
      const action$ = of<RaidenAction>(
        channelMonitor({ id: channelId }, { tokenNetwork, partner }),
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
      const action$ = of(matrixPresence.request(undefined, { address: partner })).pipe(delay(0)),
        state$ = of(state);

      matrix.searchUserDirectory.mockImplementationOnce(async () => ({
        limited: false,
        results: [{ user_id: partnerUserId }],
      }));

      await expect(
        matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: matrixPresence.failure.type,
        payload: expect.any(Error),
        error: true,
        meta: { address: partner },
      });
    });

    test('fails when users does not have valid addresses', async () => {
      expect.assertions(1);
      const action$ = of(matrixPresence.request(undefined, { address: partner })).pipe(delay(0)),
        state$ = of(state);

      matrix.searchUserDirectory.mockImplementationOnce(async () => ({
        limited: false,
        results: [{ user_id: `@invalidUser:${matrixServer}`, display_name: 'display_name' }],
      }));

      await expect(
        matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: matrixPresence.failure.type,
        payload: expect.any(Error),
        error: true,
        meta: { address: partner },
      });
    });

    test('fails when users does not have presence or unknown address', async () => {
      expect.assertions(1);
      const action$ = of(matrixPresence.request(undefined, { address: partner })).pipe(delay(0)),
        state$ = of(state);

      (verifyMessage as jest.Mock).mockReturnValueOnce(token);
      matrix.searchUserDirectory.mockImplementationOnce(async () => ({
        limited: false,
        results: [{ user_id: partnerUserId, display_name: 'display_name' }],
      }));

      await expect(
        matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: matrixPresence.failure.type,
        payload: expect.any(Error),
        error: true,
        meta: { address: partner },
      });
    });

    test('fails when verifyMessage throws', async () => {
      expect.assertions(1);
      const action$ = of(matrixPresence.request(undefined, { address: partner })).pipe(delay(0)),
        state$ = of(state);
      matrix.searchUserDirectory.mockImplementationOnce(async () => ({
        limited: false,
        results: [{ user_id: partnerUserId, display_name: 'display_name' }],
      }));
      (verifyMessage as jest.Mock).mockImplementationOnce(() => {
        throw new Error('invalid signature');
      });

      await expect(
        matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: matrixPresence.failure.type,
        payload: expect.any(Error),
        error: true,
        meta: { address: partner },
      });
    });

    test('success with previously monitored user', async () => {
      expect.assertions(1);
      const presence = matrixPresence.success(
          { userId: partnerUserId, available: false, ts: Date.now() },
          { address: partner },
        ),
        action$ = new Subject<RaidenAction>(),
        state$ = of(state);

      const promise = matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise();

      action$.next(presence);
      setTimeout(() => {
        action$.next(matrixPresence.request(undefined, { address: partner }));
        action$.complete();
      }, 5);

      await expect(promise).resolves.toBe(presence);
    });

    test('success with searchUserDirectory and getUserPresence', async () => {
      expect.assertions(1);
      const action$ = of(matrixPresence.request(undefined, { address: partner })).pipe(delay(0)),
        state$ = of(state);
      await expect(
        matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: matrixPresence.success.type,
        payload: { userId: partnerUserId, available: true, ts: expect.any(Number) },
        meta: { address: partner },
      });
    });

    test('success even if some getUserPresence fails', async () => {
      expect.assertions(1);
      const action$ = of(matrixPresence.request(undefined, { address: partner })).pipe(delay(0)),
        state$ = of(state);

      matrix.searchUserDirectory.mockImplementationOnce(async () => ({
        limited: false,
        results: [
          { user_id: `@${partner.toLowerCase()}.2:${matrixServer}`, display_name: '2' },
          { user_id: partnerUserId, display_name: '1' },
        ],
      }));
      matrix._http.authedRequest.mockRejectedValueOnce(new Error('Could not fetch presence'));

      await expect(
        matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: matrixPresence.success.type,
        payload: { userId: partnerUserId, available: true, ts: expect.any(Number) },
        meta: { address: partner },
      });
    });
  });

  describe('matrixPresenceUpdateEpic', () => {
    test('success presence update', async () => {
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

      matrix.emit('event', {
        getType: () => 'm.presence',
        getSender: () => partnerUserId,
      });

      await expect(promise).resolves.toMatchObject({
        type: matrixPresence.success.type,
        payload: { userId: partnerUserId, available: false, ts: expect.any(Number) },
        meta: { address: partner },
      });
    });

    test('update without changing availability does not emit', async () => {
      expect.assertions(1);
      const action$ = of(
          matrixPresence.request(undefined, { address: partner }),
          matrixPresence.success(
            { userId: partnerUserId, available: true, ts: 123 },
            { address: partner },
          ),
        ),
        state$ = of(state);

      matrix.getUser.mockImplementationOnce(userId => ({ userId, presence: 'unavailable' }));

      const promise = matrixPresenceUpdateEpic(action$, state$, depsMock)
        .pipe(takeUntil(timer(50)))
        .toPromise();

      matrix.emit('event', {
        getType: () => 'm.presence',
        getSender: () => partnerUserId,
      });

      await expect(promise).resolves.toBeUndefined();
    });

    test('cached displayName but invalid signature', async () => {
      expect.assertions(1);
      const action$ = of(
          matrixPresence.request(undefined, { address: partner }),
          matrixPresence.success(
            { userId: partnerUserId, available: true, ts: 123 },
            { address: partner },
          ),
        ),
        state$ = of(state);

      matrix.getUser.mockImplementationOnce(userId => ({
        userId,
        presence: 'offline',
        displayName: `partner_display_name`,
      }));
      (verifyMessage as jest.Mock).mockReturnValueOnce(token);

      const promise = matrixPresenceUpdateEpic(action$, state$, depsMock)
        .pipe(takeUntil(timer(50)))
        .toPromise();

      matrix.emit('event', {
        getType: () => 'm.presence',
        getSender: () => partnerUserId,
      });

      await expect(promise).resolves.toBeUndefined();
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

  describe('matrixCreateRoomEpic', () => {
    test('success: concurrent messages create single room', async () => {
      expect.assertions(2);
      const action$ = of(
          messageSend.request({ message: 'message1' }, { address: partner, msgId: 'message1' }),
          messageSend.request({ message: 'message2' }, { address: partner, msgId: 'message2' }),
          messageSend.request({ message: 'message3' }, { address: partner, msgId: 'message3' }),
          messageSend.request({ message: 'message4' }, { address: partner, msgId: 'message4' }),
          messageSend.request({ message: 'message5' }, { address: partner, msgId: 'message5' }),
          matrixPresence.success(
            { userId: partnerUserId, available: true, ts: 123 },
            { address: partner },
          ),
        ),
        state$ = new BehaviorSubject(state);

      const promise = matrixCreateRoomEpic(action$, state$, depsMock)
        .pipe(
          // update state with action, to ensure serial handling knows about already created room
          tap(action => state$.next(raidenReducer(state, action))),
          takeUntil(timer(50)),
        )
        .toPromise();

      await expect(promise).resolves.toMatchObject({
        type: matrixRoom.type,
        payload: { roomId: expect.stringMatching(new RegExp(`^!.*:${matrixServer}$`)) },
        meta: { address: partner },
      });
      // ensure multiple concurrent messages only create a single room
      expect(matrix.createRoom).toHaveBeenCalledTimes(1);
    });
  });

  describe('matrixInviteEpic', () => {
    test('do not invite if there is no room for user', async () => {
      expect.assertions(2);
      const action$ = of(
          matrixPresence.success(
            { userId: partnerUserId, available: true, ts: 123 },
            { address: partner },
          ),
        ),
        state$ = of(state);

      const promise = matrixInviteEpic(action$, state$, depsMock).toPromise();

      await expect(promise).resolves.toBeUndefined();
      expect(matrix.invite).not.toHaveBeenCalled();
    });

    test('invite if there is room for user', () => {
      expect.assertions(2);
      const action$ = of(
          matrixPresence.success(
            { userId: partnerUserId, available: true, ts: 123 },
            { address: partner },
          ),
        ),
        roomId = partnerRoomId,
        state$ = of(raidenReducer(state, matrixRoom({ roomId }, { address: partner })));

      matrix.invite.mockResolvedValueOnce(true);
      // partner joins when they're invited the second time
      matrix.invite.mockImplementationOnce(async () => {
        matrix.emit(
          'RoomMember.membership',
          {},
          { roomId, userId: partnerUserId, membership: 'join' },
        );
        return true;
      });

      // epic needs to wait for the room to become available
      matrix.getRoom.mockReturnValueOnce(null);

      const sub = matrixInviteEpic(action$, state$, depsMock).subscribe();

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
      const action$ = of(
          matrixPresence.success(
            { userId: partnerUserId, available: true, ts: 123 },
            { address: partner },
          ),
        ),
        state$ = of(state),
        roomId = partnerRoomId;

      const promise = matrixHandleInvitesEpic(action$, state$, depsMock)
        .pipe(first())
        .toPromise();

      matrix.emit(
        'RoomMember.membership',
        { getSender: () => partnerUserId },
        { roomId, userId, membership: 'invite' },
      );

      await expect(promise).resolves.toMatchObject({
        type: matrixRoom.type,
        payload: { roomId },
        meta: { address: partner },
      });
      expect(matrix.joinRoom).toHaveBeenCalledTimes(1);
      expect(matrix.joinRoom).toHaveBeenCalledWith(
        roomId,
        expect.objectContaining({ syncRoom: true }),
      );
    });

    test('accept & join from late presence', async () => {
      expect.assertions(3);
      const action$ = new Subject<RaidenAction>(),
        state$ = of(state),
        roomId = partnerRoomId;

      const promise = matrixHandleInvitesEpic(action$, state$, depsMock)
        .pipe(first())
        .toPromise();

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

      await expect(promise).resolves.toMatchObject({
        type: matrixRoom.type,
        payload: { roomId },
        meta: { address: partner },
      });
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

      await expect(promise).resolves.toMatchObject({
        type: matrixRoomLeave.type,
        payload: { roomId },
        meta: { address: partner },
      });
      expect(matrix.leave).toHaveBeenCalledTimes(1);
      expect(matrix.leave).toHaveBeenCalledWith(roomId);
    });
  });

  describe('matrixLeaveUnknownRoomsEpic', () => {
    beforeEach(() => jest.useFakeTimers());

    test(
      'leave unknown rooms',
      fakeSchedulers(advance => {
        expect.assertions(3);
        const roomId = `!unknownRoomId:${matrixServer}`,
          state$ = of(state);

        const sub = matrixLeaveUnknownRoomsEpic(EMPTY, state$, depsMock).subscribe();

        matrix.emit('Room', { roomId });

        advance(1e3);

        // we should wait a little before leaving rooms
        expect(matrix.leave).not.toHaveBeenCalled();

        advance(200e3);

        expect(matrix.leave).toHaveBeenCalledTimes(1);
        expect(matrix.leave).toHaveBeenCalledWith(roomId);

        sub.unsubscribe();
      }),
    );

    test(
      'do not leave discovery room',
      fakeSchedulers(advance => {
        expect.assertions(2);

        const roomId = `!discoveryRoomId:${matrixServer}`,
          state$ = of(state),
          name = `#raiden_${depsMock.network.name}_discovery:${matrixServer}`;

        matrix.getRoom.mockReturnValueOnce({
          roomId,
          name,
          getMember: jest.fn(),
          getJoinedMembers: jest.fn(() => []),
          getCanonicalAlias: jest.fn(() => name),
          getAliases: jest.fn(() => []),
        });

        const sub = matrixLeaveUnknownRoomsEpic(EMPTY, state$, depsMock).subscribe();

        matrix.emit('Room', { roomId });

        advance(1e3);

        // we should wait a little before leaving rooms
        expect(matrix.leave).not.toHaveBeenCalled();

        advance(200e3);

        // even after some time, discovery room isn't left
        expect(matrix.leave).not.toHaveBeenCalled();

        sub.unsubscribe();
      }),
    );

    test(
      'do not leave peers rooms',
      fakeSchedulers(advance => {
        expect.assertions(2);

        const roomId = partnerRoomId,
          state$ = of(raidenReducer(state, matrixRoom({ roomId }, { address: partner })));

        const sub = matrixLeaveUnknownRoomsEpic(EMPTY, state$, depsMock).subscribe();

        matrix.emit('Room', { roomId });

        advance(1e3);

        // we should wait a little before leaving rooms
        expect(matrix.leave).not.toHaveBeenCalled();

        advance(200e3);

        // even after some time, partner's room isn't left
        expect(matrix.leave).not.toHaveBeenCalled();

        sub.unsubscribe();
      }),
    );
  });

  describe('matrixCleanLeftRoomsEpic', () => {
    test('clean left rooms', async () => {
      expect.assertions(1);

      const roomId = partnerRoomId,
        state$ = of(raidenReducer(state, matrixRoom({ roomId }, { address: partner })));

      const promise = matrixCleanLeftRoomsEpic(EMPTY, state$, depsMock)
        .pipe(first())
        .toPromise();

      matrix.emit('Room.myMembership', { roomId }, 'leave');

      await expect(promise).resolves.toMatchObject({
        type: matrixRoomLeave.type,
        payload: { roomId },
        meta: { address: partner },
      });
    });
  });

  describe('matrixMessageSendEpic', () => {
    test('send: all needed objects in place', async () => {
      expect.assertions(3);

      const roomId = partnerRoomId,
        message = processed,
        signed = await signMessage(depsMock.signer, message),
        action$ = of(
          matrixPresence.success(
            { userId: partnerUserId, available: true, ts: Date.now() },
            { address: partner },
          ),
          messageSend.request(
            { message: signed },
            { address: partner, msgId: signed.message_identifier.toString() },
          ),
        ),
        state$ = of(raidenReducer(state, matrixRoom({ roomId }, { address: partner })));

      matrix.getRoom.mockReturnValueOnce({
        roomId,
        name: roomId,
        getMember: jest.fn(userId => ({
          roomId,
          userId,
          name: userId,
          membership: 'join',
          user: null,
        })),
        getJoinedMembers: jest.fn(() => []),
        getCanonicalAlias: jest.fn(() => roomId),
        getAliases: jest.fn(() => []),
      });

      expect(matrixMessageSendEpic(action$, state$, depsMock).toPromise()).resolves.toMatchObject(
        messageSend.success(undefined, {
          address: partner,
          msgId: signed.message_identifier.toString(),
        }),
      );
      expect(matrix.sendEvent).toHaveBeenCalledTimes(1);
      expect(matrix.sendEvent).toHaveBeenCalledWith(
        roomId,
        'm.room.message',
        expect.objectContaining({ body: expect.stringMatching('"Processed"'), msgtype: 'm.text' }),
        expect.anything(),
      );
    });

    test('send: Room appears late, user joins late', async () => {
      expect.assertions(3);

      const roomId = partnerRoomId,
        message = 'test message',
        action$ = of(
          matrixPresence.success(
            { userId: partnerUserId, available: true, ts: Date.now() },
            { address: partner },
          ),
          messageSend.request({ message }, { address: partner, msgId: message }),
        ),
        state$ = of(raidenReducer(state, matrixRoom({ roomId }, { address: partner })));

      matrix.getRoom.mockReturnValueOnce(null);

      const sub = matrixMessageSendEpic(action$, state$, depsMock).subscribe();

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
  });

  describe('matrixMessageReceivedEpic', () => {
    let state$: BehaviorSubject<RaidenState>;

    beforeEach(() => {
      state$ = new BehaviorSubject<RaidenState>(
        [
          matrixSetup({
            server: matrixServer,
            setup: { userId, deviceId, accessToken, displayName },
          }),
        ].reduce(raidenReducer, state),
      );
    });

    test('receive: success on late presence and late room', async () => {
      expect.assertions(1);

      const roomId = partnerRoomId,
        message = 'test message',
        action$ = new Subject<RaidenAction>();

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
      state$.next(
        [matrixRoom({ roomId }, { address: partner })].reduce(raidenReducer, state$.value),
      );

      // then it resolves
      await expect(promise).resolves.toMatchObject({
        type: messageReceived.type,
        payload: {
          text: message,
          ts: expect.any(Number),
          userId: partnerUserId,
          roomId,
        },
        meta: { address: partner },
      });
    });

    test('receive: decode signed message', async () => {
      expect.assertions(1);

      const roomId = partnerRoomId,
        signed = await signMessage(partnerSigner, processed),
        message = encodeJsonMessage(signed),
        action$ = of(
          matrixPresence.success(
            { userId: partnerUserId, available: true, ts: Date.now() },
            { address: partner },
          ),
        );
      state$.next(
        [matrixRoom({ roomId }, { address: partner })].reduce(raidenReducer, state$.value),
      );

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
      await expect(promise).resolves.toMatchObject({
        type: messageReceived.type,
        payload: {
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
        meta: { address: partner },
      });
    });

    test("receive: messages from wrong sender aren't decoded", async () => {
      expect.assertions(1);

      const roomId = partnerRoomId,
        // signed by ourselves
        signed = await signMessage(depsMock.signer, processed),
        message = encodeJsonMessage(signed),
        action$ = of(
          matrixPresence.success(
            { userId: partnerUserId, available: true, ts: Date.now() },
            { address: partner },
          ),
        );
      state$.next(
        [matrixRoom({ roomId }, { address: partner })].reduce(raidenReducer, state$.value),
      );

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
      await expect(promise).resolves.toMatchObject({
        type: messageReceived.type,
        payload: {
          text: message,
          message: undefined,
          ts: expect.any(Number),
          userId: partnerUserId,
          roomId,
        },
        meta: { address: partner },
      });
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

  test('deliveredEpic', async () => {
    expect.assertions(5);

    const roomId = partnerRoomId,
      message = await signMessage(partnerSigner, processed),
      text = encodeJsonMessage(message),
      action = messageReceived(
        { text, message, ts: 123, userId: partnerUserId, roomId },
        { address: partner },
      ),
      other: Delivered = {
        type: MessageType.DELIVERED,
        delivered_message_identifier: makeMessageId(),
      },
      otherSigned = await signMessage(partnerSigner, other),
      otherText = encodeJsonMessage(otherSigned),
      otherAction = messageReceived(
        { text: otherText, message: otherSigned, ts: 456, userId: partnerUserId, roomId },
        { address: partner },
      ),
      // twice messageReceived
      action$ = of(action, action, otherAction);

    const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

    const output = await deliveredEpic(action$, EMPTY, depsMock)
      .pipe(toArray())
      .toPromise();

    expect(output).toHaveLength(2);
    expect(output[0]).toEqual(
      messageSend.request(
        {
          message: {
            type: MessageType.DELIVERED,
            delivered_message_identifier: message.message_identifier,
            signature: expect.any(String),
          },
        },
        { address: action.meta.address, msgId: message.message_identifier.toString() },
      ),
    );
    expect(output[1].payload.message).toBe(output[0].payload.message);

    // second signature should have been cached
    expect(signerSpy).toHaveBeenCalledTimes(1);
    signerSpy.mockRestore();

    // if you pass something different than the accepted messages, no Delivered is replied
    await expect(
      deliveredEpic(of(otherAction), EMPTY, depsMock).toPromise(),
    ).resolves.toBeUndefined();
  });

  test('matrixMessageGlobalSendEpic', async () => {
    expect.assertions(5);

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

    await expect(
      matrixMessageGlobalSendEpic(
        of(messageGlobalSend({ message }, { roomName: state.config.discoveryRoom! })),
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
});
