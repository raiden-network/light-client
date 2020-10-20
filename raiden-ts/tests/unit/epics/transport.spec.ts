/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  makeSignature,
  mockRTC,
  makeRaiden,
  makeRaidens,
  MockedRaiden,
  sleep,
  fetch,
} from '../mocks';
import { ensureChannelIsOpen, token } from '../fixtures';

import { MatrixClient } from 'matrix-js-sdk';
import { first } from 'rxjs/operators';
import { verifyMessage, BigNumber } from 'ethers/utils';
import { raidenConfigUpdate } from 'raiden-ts/actions';

import {
  matrixPresence,
  matrixRoom,
  matrixSetup,
  matrixRoomLeave,
  rtcChannel,
} from 'raiden-ts/transport/actions';
import { messageSend, messageReceived, messageGlobalSend } from 'raiden-ts/messages/actions';

import { MessageType, Delivered, Processed } from 'raiden-ts/messages/types';
import { makeMessageId } from 'raiden-ts/transfers/utils';
import { encodeJsonMessage, signMessage } from 'raiden-ts/messages/utils';
import { Signed } from 'raiden-ts/utils/types';
import { Capabilities } from 'raiden-ts/constants';
import { jsonParse, jsonStringify } from 'raiden-ts/utils/data';
import { makeDefaultConfig } from 'raiden-ts/config';

describe('transport epic', () => {
      matrix._http.authedRequest.mockResolvedValueOnce({
        presence: 'offline',
        last_active_ago: 123,
      });
      matrix.emit('Room', {
        getMember: jest.fn(),
        getJoinedMembers: jest.fn(),
      });
  const matrixServer = 'matrix.raiden.test'; // define later in fixture constant
  const partnerRoomId = `!partnerRoomId:${matrixServer}`;
  const accessToken = 'access_token';
  const deviceId = 'device_id';
  const displayName = 'display_name';
  const processed: Processed = {
    type: MessageType.PROCESSED,
    message_identifier: makeMessageId(),
  };

  describe('initMatrixEpic', () => {
    let raiden: MockedRaiden;
    beforeEach(async () => {
      raiden = await makeRaiden(undefined, false);
      fetch.mockImplementation(async () => ({
        ok: true,
        status: 200,
        json: jest.fn<Promise<unknown>, []>(async () => ({
          active_servers: [matrixServer],
          all_servers: [],
        })),
      }));
      Object.assign(globalThis, { fetch });
    });

    afterEach(() => {
      jest.clearAllMocks();
    });
    test('matrix stored setup', async () => {
      expect.assertions(2);
      await raiden.start();
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const userId = matrix.getUserId()!;
      raiden.store.dispatch(
        matrixSetup({
          server: `https://${matrix.getHomeserverUrl()}`,
          setup: {
            userId,
            accessToken,
            deviceId,
            displayName,
          },
        }),
      );

      await sleep(raiden.config.pollingInterval);
      expect(raiden.output).toContainEqual(
        matrixSetup({
          server: `https://${matrix.getHomeserverUrl()}`,
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
      await raiden.start();
      raiden.store.dispatch(raidenConfigUpdate({ matrixServer }));
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const userId = matrix.getUserId()!;

      expect(raiden.output).toContainEqual(
        matrixSetup({
          server: `https://${matrix.getHomeserverUrl()}`,
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
      await raiden.start();
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const userId = matrix.getUserId()!;
      raiden.store.dispatch(
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
      raiden.store.dispatch(raidenConfigUpdate({ matrixServer }));

      expect(raiden.output).toContainEqual(
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
      expect.assertions(2);

      // jest.setTimeout(6000);
      // make the matrixServer empty otherwise fetchSortedMatrixServers$
      // inside initMatrixEpic is not called. This will force fetching server list
      raiden.deps.defaultConfig = makeDefaultConfig(
        { network: raiden.deps.network },
        { matrixServer: '' },
      );

      await raiden.start();
      raiden.store.dispatch(raidenConfigUpdate({ httpTimeout: 10 }));
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const userId = matrix.getUserId()!;
      await sleep(raiden.config.pollingInterval);
      expect(raiden.output).toContainEqual(
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
    }, 6000);

    test('matrix throws if can not fetch servers list', async () => {
      // test fails because initMatrixEpic does not validate correctness of server
      // TODO: Also somehow check that the epic throws error
      // Could not fetch server list
      expect.assertions(1);

      // jest.setTimeout(6000);
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: jest.fn(async () => ({})),
      });

      raiden.deps.defaultConfig = makeDefaultConfig(
        { network: raiden.deps.network },
        { matrixServer: '///' },
      );
      await raiden.start();
      raidenConfigUpdate({ httpTimeout: 10 });
      await sleep(raiden.config.pollingInterval);
      expect(fetch).toHaveBeenCalledTimes(1);
    }, 6000);

    test('matrix throws if can not contact any server from list', async () => {
      // TODO: check if the initMatrixEpic throws ErrorCodes.TRNS_NO_MATRIX_SERVERS
      expect.assertions(1);
      //jest.setTimeout(6000);
      // mock*Once is a stack. this 'fetch' will be for the servers list
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn(async () => ({
          active_servers: [matrixServer],
          all_servers: [],
        })),
      });
      // and this one for matrixRTT. 404 will reject it
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: jest.fn(async () => ({})),
      });
      raiden.deps.defaultConfig = makeDefaultConfig(
        { network: raiden.deps.network },
        { matrixServer: '' },
      );
      await raiden.start();
      raidenConfigUpdate({ httpTimeout: 10 });
      await sleep(raiden.config.pollingInterval);
      expect(fetch).toHaveBeenCalledTimes(2);
    }, 6000);
  });

  describe('matrixMonitorChannelPresenceEpic', () => {
    test('channelMonitored triggers matrixPresence.request', async () => {
      const [raiden, partner] = await makeRaidens(2);
      await ensureChannelIsOpen([raiden, partner]);

      expect(raiden.output).toContainEqual(
        matrixPresence.request(undefined, { address: partner.address }),
      );
    });
  });

  describe('matrixShutdownEpic', () => {
    test('stopClient called on action$ completion', async () => {
      expect.assertions(2);
      const raiden = await makeRaiden(undefined);
      const matrix = await raiden.deps.matrix$.toPromise();
      expect(matrix.stopClient).not.toHaveBeenCalled();
      raiden.stop();
      expect(matrix.stopClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('matrixMonitorPresenceEpic', () => {
    test('fails when users does not have displayName', async () => {
      expect.assertions(1);

      const [raiden, partner] = await makeRaidens(2);
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      matrix.searchUserDirectory = jest.fn().mockImplementationOnce(async () => ({
        limited: false,
        results: [{ user_id: partnerMatrix.getUserId() }],
      }));

      raiden.store.dispatch(matrixPresence.request(undefined, { address: partner.address }));

      await sleep(2 * raiden.config.pollingInterval);
      expect(raiden.output).toContainEqual(
        matrixPresence.failure(expect.any(Error), { address: partner.address }),
      );
    });

    test('fails when users does not have valid addresses', async () => {
      expect.assertions(1);
      const [raiden, partner] = await makeRaidens(2);
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;

      matrix.searchUserDirectory = jest.fn().mockImplementation(async () => ({
        limited: false,
        results: [{ user_id: `@invalidUser:${matrixServer}`, display_name: 'display_name' }],
      }));

      raiden.store.dispatch(matrixPresence.request(undefined, { address: partner.address }));

      await sleep(2 * raiden.config.pollingInterval);
      expect(raiden.output).toContainEqual(
        matrixPresence.failure(expect.any(Error), { address: partner.address }),
      );
    });

    test('fails when users does not have presence or unknown address', async () => {
      expect.assertions(1);

      const [raiden, partner] = await makeRaidens(2);
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      (verifyMessage as jest.Mock).mockReturnValueOnce(token);
      matrix.searchUserDirectory = jest.fn().mockImplementation(async () => ({
        limited: false,
        results: [{ user_id: partnerMatrix.getUserId(), display_name: 'display_name' }],
      }));

      raiden.store.dispatch(matrixPresence.request(undefined, { address: partner.address }));

      await sleep(2 * raiden.config.pollingInterval);
      expect(raiden.output).toContainEqual(
        matrixPresence.failure(expect.any(Error), { address: partner.address }),
      );
    });

    test('fails when verifyMessage throws', async () => {
      expect.assertions(1);

      const [raiden, partner] = await makeRaidens(2);
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;

      matrix.searchUserDirectory = jest.fn().mockImplementation(async () => ({
        limited: false,
        results: [{ user_id: partnerMatrix.getUserId(), display_name: 'display_name' }],
      }));
      (verifyMessage as jest.Mock).mockImplementationOnce(() => {
        throw new Error('invalid signature');
      });

      raiden.store.dispatch(matrixPresence.request(undefined, { address: partner.address }));

      await sleep(2 * raiden.config.pollingInterval);
      expect(raiden.output).toContainEqual(
        matrixPresence.failure(expect.any(Error), { address: partner.address }),
      );
    });

    test('success with previously monitored user', async () => {
      expect.assertions(1);
      const [raiden, partner] = await makeRaidens(2);
      const partnerMatrix = await partner.deps.matrix$.toPromise();
      const presence = matrixPresence.success(
        { userId: partnerMatrix.getUserId()!, available: false, ts: Date.now() },
        { address: partner.address },
      );

      raiden.store.dispatch(presence);
      const sliceLength = raiden.output.length;
      raiden.store.dispatch(matrixPresence.request(undefined, { address: partner.address }));

      await sleep(2 * raiden.config.pollingInterval);
      expect(raiden.output.slice(sliceLength)).toContainEqual(presence);
    });

    test('success with searchUserDirectory and getUserPresence', async () => {
      expect.assertions(1);

      const [raiden, partner] = await makeRaidens(2);
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      matrix.searchUserDirectory = jest.fn().mockImplementation(async ({ term }) => ({
        results: [
          {
            user_id: `@${term}:${matrixServer}`,
            display_name: `${term}_display_name`,
            avatar_url: 'mxc://raiden.network/cap?Delivery=0&randomCap=test',
          },
        ],
      }));

      raiden.store.dispatch(matrixPresence.request(undefined, { address: partner.address }));

      await sleep(2 * raiden.config.pollingInterval);
      expect(raiden.output).toContainEqual(
        matrixPresence.success(
          {
            userId: partnerMatrix.getUserId()!,
            available: true,
            ts: expect.any(Number),
            caps: { [Capabilities.DELIVERY]: 0, randomCap: 'test' },
          },
          { address: partner.address },
        ),
      );
    });

    test('success even if some getUserPresence fails', async () => {
      expect.assertions(1);

      const [raiden, partner] = await makeRaidens(2);
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      matrix.searchUserDirectory = jest.fn().mockImplementationOnce(async () => ({
        limited: false,
        results: [
          { user_id: `@${partner.address.toLowerCase()}.2:${matrixServer}`, display_name: '2' },
          { user_id: partnerMatrix.getUserId(), display_name: '1' },
        ],
      }));
      matrix._http.authedRequest.mockRejectedValueOnce(new Error('Could not fetch presence'));

      raiden.store.dispatch(matrixPresence.request(undefined, { address: partner.address }));

      await sleep(2 * raiden.config.pollingInterval);
      expect(raiden.output).toContainEqual(
        matrixPresence.success(
          { userId: partnerMatrix.getUserId()!, available: true, ts: expect.any(Number) },
          { address: partner.address },
        ),
      );
    });
  });

  describe('matrixPresenceUpdateEpic', () => {
    test('success presence update with caps', async () => {
      expect.assertions(1);
      const [raiden, partner] = await makeRaidens(2);
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;

      raiden.store.dispatch(matrixPresence.request(undefined, { address: partner.address }));
      raiden.store.dispatch(
        matrixPresence.success(
          { userId: partnerMatrix.getUserId()!, available: true, ts: 123 },
          { address: partner.address },
        ),
      );

      matrix.getProfileInfo = jest.fn().mockResolvedValueOnce({
        displayname: `${matrix.getUserId()}_display_name`,
        avatar_url: `mxc://raiden.network/cap?Delivery=0`,
      });

      matrix.emit('event', {
        getType: () => 'm.presence',
        getSender: () => partnerMatrix.getUserId(),
      });

      await sleep(2 * raiden.config.pollingInterval);
      expect(raiden.output).toContainEqual(
        matrixPresence.success(
          {
            userId: partnerMatrix.getUserId()!,
            available: false,
            ts: expect.any(Number),
            caps: { [Capabilities.DELIVERY]: 0 },
          },
          { address: partner.address },
        ),
      );
    });

    test('getProfileInfo error', async () => {
      // need to check this test again
      expect.assertions(1);

      const [raiden, partner] = await makeRaidens(2);
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;

      matrix.getProfileInfo = jest
        .fn()
        .mockRejectedValueOnce(new Error('could not get user profile'));
      matrix.emit('event', {
        getType: () => 'm.presence',
        getSender: () => partnerMatrix.getUserId(),
      });

      raiden.store.dispatch(matrixPresence.request(undefined, { address: partner.address }));

      await sleep(2 * raiden.config.pollingInterval);
      expect(raiden.output).not.toContainEqual(
        matrixPresence.success(
          { userId: partnerMatrix.getUserId()!, available: true, ts: 123 },
          { address: partner.address },
        ),
      );
    });
  });

  test('matrixUpdateCapsEpic', async () => {
    // Please check this test thoroughly whether we are testing the right things
    expect.assertions(5);

    const raiden = await makeRaiden(undefined);
    const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;

    raiden.store.dispatch(raidenConfigUpdate({ caps: { [Capabilities.DELIVERY]: 0 } }));

    await sleep(2 * raiden.config.pollingInterval);
    expect(matrix.setAvatarUrl).toHaveBeenCalledTimes(1);
    // expect(matrix.setAvatarUrl).toHaveBeenCalledWith('noDelivery');

    matrix.setAvatarUrl.mockRejectedValueOnce(new Error('failed'));
    raiden.store.dispatch(
      raidenConfigUpdate({
        caps: { [Capabilities.DELIVERY]: 1 },
      }),
    );

    await sleep(2 * raiden.config.pollingInterval);
    expect(matrix.setAvatarUrl).toHaveBeenCalledTimes(2);
    expect(matrix.setAvatarUrl).toHaveBeenCalledWith(
      expect.stringMatching(`mxc://raiden.network/cap?.*${Capabilities.DELIVERY}=1`),
    );

    raiden.store.dispatch(raidenConfigUpdate({ caps: { customCap: 'abc' } }));

    await sleep(2 * raiden.config.pollingInterval);
    expect(matrix.setAvatarUrl).toHaveBeenCalledTimes(3);
    expect(matrix.setAvatarUrl).toHaveBeenCalledWith(
      expect.stringMatching(
        `mxc://raiden.network/cap?.*${Capabilities.DELIVERY}=0&.*customCap=abc`,
      ),
    );
  });

  describe('matrixCreateRoomEpic', () => {
    test('success: concurrent messages create single room', async () => {
      expect.assertions(2);
      const [raiden, partner] = await makeRaidens(2);
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;

      raiden.store.dispatch(
        messageSend.request(
          { message: 'message1' },
          { address: partner.address, msgId: 'message1' },
        ),
      );
      raiden.store.dispatch(
        messageSend.request(
          { message: 'message2' },
          { address: partner.address, msgId: 'message2' },
        ),
      );
      raiden.store.dispatch(
        messageSend.request(
          { message: 'message3' },
          { address: partner.address, msgId: 'message3' },
        ),
      );
      raiden.store.dispatch(
        messageSend.request(
          { message: 'message4' },
          { address: partner.address, msgId: 'message4' },
        ),
      );
      raiden.store.dispatch(
        messageSend.request(
          { message: 'message5' },
          { address: partner.address, msgId: 'message5' },
        ),
      );
      raiden.store.dispatch(
        matrixPresence.success(
          { userId: partnerMatrix.getUserId()!, available: true, ts: 123 },
          { address: partner.address },
        ),
      );

      await sleep(2 * raiden.config.pollingInterval);
      expect(raiden.output).toContainEqual(
        matrixRoom(
          { roomId: expect.stringMatching(new RegExp(`^!.*:${matrixServer}$`)) },
          { address: partner.address },
        ),
      );
      expect(matrix.createRoom).toHaveBeenCalledTimes(1);
    });
  });

  describe('matrixInviteEpic', () => {
    test('do not invite if there is no room for user', async () => {
      expect.assertions(1);
      const [raiden, partner] = await makeRaidens(2);
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;

      raiden.store.dispatch(
        matrixPresence.success(
          { userId: partnerMatrix.getUserId()!, available: true, ts: 123 },
          { address: partner.address },
        ),
      );
      expect(matrix.invite).not.toHaveBeenCalled();
    });

    test('invite if there is room for user', async () => {
      expect.assertions(2);
      const [raiden, partner] = await makeRaidens(2);
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const roomId = partnerRoomId;
      raiden.store.dispatch(matrixRoom({ roomId }, { address: partner.address }));
      // partner joins when they're invited the second time
      const promise = new Promise((resolve) =>
        matrix.invite.mockImplementation(async () => {
          matrix.emit(
            'RoomMember.membership',
            {},
            { roomId, userId: partnerMatrix.getUserId(), membership: 'join' },
          );
          resolve();
        }),
      );
      matrix.invite.mockResolvedValueOnce(Promise.resolve());

      // epic needs to wait for the room to become available
      matrix.getRoom.mockReturnValueOnce(null);

      raiden.store.dispatch(
        matrixPresence.success(
          { userId: partnerMatrix.getUserId()!, available: true, ts: 123 },
          { address: partner.address },
        ),
      );

      await promise;
      expect(matrix.invite).toHaveBeenCalledTimes(2);
      expect(matrix.invite).toHaveBeenCalledWith(roomId, partnerMatrix.getUserId());
    });
  });

  describe('matrixHandleInvitesEpic', () => {
    test('accept & join from previous presence', async () => {
      expect.assertions(3);
      const roomId = partnerRoomId;
      const [raiden, partner] = await makeRaidens(2);
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;

      raiden.store.dispatch(
        matrixPresence.success(
          { userId: partnerMatrix.getUserId()!, available: true, ts: 123 },
          { address: partner.address },
        ),
      );

      await sleep(2 * raiden.config.pollingInterval);
      matrix.emit(
        'RoomMember.membership',
        { getSender: () => partnerMatrix.getUserId() },
        { roomId, userId: matrix.getUserId(), membership: 'invite' },
      );

      await sleep(2 * raiden.config.pollingInterval);
      expect(raiden.output).toContainEqual(matrixRoom({ roomId }, { address: partner.address }));
      expect(matrix.joinRoom).toHaveBeenCalledTimes(4);
      expect(matrix.joinRoom).toHaveBeenCalledWith(
        roomId,
        expect.objectContaining({ syncRoom: true }),
      );
    });

    test('accept & join from late presence', async () => {
      expect.assertions(3);
      const roomId = partnerRoomId;
      const [raiden, partner] = await makeRaidens(2);
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      matrix.emit(
        'RoomMember.membership',
        { getSender: () => partnerMatrix.getUserId() },
        { roomId, userId: matrix.getUserId(), membership: 'invite' },
      );

      raiden.store.dispatch(
        matrixPresence.success(
          { userId: partnerMatrix.getUserId()!, available: true, ts: Date.now() },
          { address: partner.address },
        ),
      );

      await sleep(2 * raiden.config.pollingInterval);
      expect(raiden.output).toContainEqual(matrixRoom({ roomId }, { address: partner.address }));
      expect(matrix.joinRoom).toHaveBeenCalledTimes(4);
      expect(matrix.joinRoom).toHaveBeenCalledWith(
        roomId,
        expect.objectContaining({ syncRoom: true }),
      );
    });

    test('do not accept invites from non-monitored peers', async () => {
      expect.assertions(1);

      const roomId = partnerRoomId;
      const [raiden, partner] = await makeRaidens(2);
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;

      matrix.emit(
        'RoomMember.membership',
        { getSender: () => partnerMatrix.getUserId() },
        { roomId, userId: matrix.getUserId(), membership: 'invite' },
      );

      expect(matrix.joinRoom).not.toHaveBeenCalled();
    });
  });

  describe('matrixLeaveExcessRoomsEpic', () => {
    test('leave rooms behind threshold', async () => {
      expect.assertions(3);
      const roomId = partnerRoomId;
      const [raiden, partner] = await makeRaidens(2);
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const action = matrixRoom(
        { roomId: `!frontRoomId_for_partner:${matrixServer}` },
        { address: partner.address },
      );
      raiden.store.dispatch(matrixRoom({ roomId }, { address: partner.address }));
      raiden.store.dispatch(
        matrixRoom({ roomId: `!roomId2:${matrixServer}` }, { address: partner.address }),
      );
      raiden.store.dispatch(
        matrixRoom({ roomId: `!roomId3:${matrixServer}` }, { address: partner.address }),
      );
      raiden.store.dispatch(action);

      await sleep(2 * raiden.config.pollingInterval);
      expect(raiden.output).toContainEqual(
        matrixRoomLeave({ roomId }, { address: partner.address }),
      );
      expect(matrix.leave).toHaveBeenCalledTimes(1);
      expect(matrix.leave).toHaveBeenCalledWith(roomId);
    });
  });

  describe('matrixLeaveUnknownRoomsEpic', () => {
    test('leave unknown rooms', async () => {
      expect.assertions(3);

      const raiden = await makeRaiden(undefined);
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const roomId = `!unknownRoomId:${matrixServer}`;

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
    });

    test('do not leave global room', async () => {
      expect.assertions(2);

      const roomId = `!discoveryRoomId:${matrixServer}`;
      const raiden = await makeRaiden(undefined);
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const roomAlias = `#raiden_${raiden.deps.network.name}_discovery:${matrixServer}`;

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
    });

    test('do not leave peers rooms', async () => {
      expect.assertions(2);

      const roomId = partnerRoomId;
      const [raiden, partner] = await makeRaidens(2);
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      raiden.store.dispatch(matrixRoom({ roomId }, { address: partner.address }));

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
    });
  });

  describe('matrixCleanLeftRoomsEpic', () => {
    test('clean left rooms', async () => {
      expect.assertions(1);

      const roomId = partnerRoomId;
      const [raiden, partner] = await makeRaidens(2);
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      raiden.store.dispatch(matrixRoom({ roomId }, { address: partner.address }));

      matrix.emit('Room.myMembership', { roomId }, 'leave');

      await sleep(2 * raiden.config.pollingInterval);
      expect(raiden.output).toContainEqual(
        matrixRoomLeave({ roomId }, { address: partner.address }),
      );
    });
  });

  describe('matrixCleanMissingRoomsEpic', () => {
    test('clean missing rooms', async () => {
      expect.assertions(1);

      const roomId = partnerRoomId;
      const roomId2 = `!partnerRoomId2:${matrixServer}`;
      const [raiden, partner] = await makeRaidens(2);
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      matrix.getRoom.mockReturnValueOnce(null).mockReturnValueOnce({
        roomId,
        name: roomId,
        getMember: jest.fn(),
        getJoinedMembers: jest.fn(),
        getCanonicalAlias: jest.fn(() => roomId),
        getAliases: jest.fn(() => []),
      } as any);

      raiden.store.dispatch(raidenConfigUpdate({ httpTimeout: 10 }));
      raiden.store.dispatch(
        matrixSetup({
          server: matrixServer,
          setup: {
            userId: matrix.getUserId()!,
            deviceId: 'device_id',
            accessToken: 'access_token',
            displayName: 'display_name',
          },
        }),
      );
      raiden.store.dispatch(matrixRoom({ roomId }, { address: partner.address }));
      raiden.store.dispatch(matrixRoom({ roomId: roomId2 }, { address: partner.address }));

      await sleep(2 * raiden.config.pollingInterval);

      raiden.store.dispatch(raidenConfigUpdate({ httpTimeout: 10 }));

      await sleep(2 * raiden.config.pollingInterval);
      // why roomId is ousted instead of roomId2
      expect(raiden.output).toContainEqual(
        matrixRoomLeave({ roomId }, { address: partner.address }),
      );
    });
  });

  describe('matrixMessageSendEpic', () => {
    test('send: all needed parts in place, errors once but retries successfully', async () => {
      expect.assertions(3);

      const [raiden, partner] = await makeRaidens(2);
      raiden.store.dispatch(raidenConfigUpdate({ httpTimeout: 30 }));
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;

      const roomId = partnerRoomId,
        message: Processed = {
          type: MessageType.PROCESSED,
          message_identifier: makeMessageId(),
        },
        signed = await signMessage(raiden.deps.signer, message);

      raiden.store.dispatch(matrixRoom({ roomId }, { address: partner.address }));

      matrix.getRoom.mockReturnValue({
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

      raiden.store.dispatch(
        messageSend.request(
          { message: signed },
          { address: partner.address, msgId: signed.message_identifier.toString() },
        ),
      );
      raiden.store.dispatch(
        matrixPresence.success(
          { userId: partnerMatrix.getUserId()!, available: true, ts: Date.now() },
          { address: partner.address },
        ),
      );

      await sleep(4 * raiden.config.pollingInterval);
      expect(raiden.output).toContainEqual(
        messageSend.success(
          { via: expect.stringMatching(/^!/) },
          {
            address: partner.address,
            msgId: signed.message_identifier.toString(),
          },
        ),
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
      const [raiden, partner] = await makeRaidens(2);
      raiden.store.dispatch(raidenConfigUpdate({ httpTimeout: 30 }));
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;

      raiden.store.dispatch(matrixRoom({ roomId }, { address: partner.address }));

      matrix.getRoom.mockReturnValue(null);

      expect(matrix.sendEvent).not.toHaveBeenCalled();
      raiden.store.dispatch(
        matrixPresence.success(
          { userId: partnerMatrix.getUserId()!, available: true, ts: Date.now() },
          { address: partner.address },
        ),
      );
      raiden.store.dispatch(
        messageSend.request({ message }, { address: partner.address, msgId: message }),
      );

      // a wild Room appears
      matrix.getRoom.mockReturnValue({
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

      // user joins later
      matrix.emit(
        'RoomMember.membership',
        {},
        {
          roomId,
          userId: partnerMatrix.getUserId(),
          name: partnerMatrix.getUserId(),
          membership: 'join',
        },
      );

      await sleep(2 * raiden.config.pollingInterval);
      expect(matrix.sendEvent).toHaveBeenCalledTimes(1);
      expect(matrix.sendEvent).toHaveBeenCalledWith(
        roomId,
        'm.room.message',
        expect.objectContaining({ body: message, msgtype: 'm.text' }),
        expect.anything(),
      );
    });

    test('sendEvent fails', async () => {
      expect.assertions(3);

      const roomId = partnerRoomId,
        message = 'Hello world!';
      const [raiden, partner] = await makeRaidens(2);
      raiden.store.dispatch(raidenConfigUpdate({ httpTimeout: 30 }));
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;

      raiden.store.dispatch(matrixRoom({ roomId }, { address: partner.address }));
      await sleep(2 * raiden.config.pollingInterval);
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
      matrix.sendEvent
        .mockRejectedValueOnce(new Error('Failed 1'))
        .mockRejectedValueOnce(new Error('Failed 2'))
        .mockRejectedValueOnce(new Error('Failed 3'));

      raiden.store.dispatch(
        matrixPresence.success(
          { userId: partnerMatrix.getUserId()!, available: true, ts: Date.now() },
          { address: partner.address },
        ),
      );
      raiden.store.dispatch(
        messageSend.request({ message }, { address: partner.address, msgId: message }),
      );

      await sleep(6 * raiden.config.pollingInterval);
      expect(raiden.output).toContainEqual(
        messageSend.failure(expect.objectContaining({ message: 'Failed 3' }), {
          address: partner.address,
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

    test('send: toDevice', async () => {
      expect.assertions(4);
      const [raiden, partner] = await makeRaidens(2);
      raiden.store.dispatch(raidenConfigUpdate({ httpTimeout: 30 }));
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const message = processed;
      const signed = await signMessage(raiden.deps.signer, message);

      raiden.store.dispatch(raidenConfigUpdate({ caps: { [Capabilities.TO_DEVICE]: 1 } }));
      // fail once, succeed on retry
      matrix.sendToDevice.mockRejectedValueOnce(new Error('Failed'));
      raiden.store.dispatch(
        matrixPresence.success(
          {
            userId: partnerMatrix.getUserId()!,
            available: true,
            ts: Date.now(),
            caps: { [Capabilities.TO_DEVICE]: 1 },
          },
          { address: partner.address },
        ),
      );
      raiden.store.dispatch(
        messageSend.request(
          { message: signed },
          { address: partner.address, msgId: signed.message_identifier.toString() },
        ),
      );

      await sleep(6 * raiden.config.pollingInterval);
      expect(raiden.output).toContainEqual(
        messageSend.success(
          { via: expect.stringMatching(/^@0x/) },
          {
            address: partner.address,
            msgId: signed.message_identifier.toString(),
          },
        ),
      );
      expect(matrix.sendEvent).not.toHaveBeenCalled();
      expect(matrix.sendToDevice).toHaveBeenCalledTimes(2);
      expect(matrix.sendToDevice).toHaveBeenCalledWith('m.room.message', {
        [partnerMatrix.getUserId()!]: {
          '*': { body: expect.stringMatching('"Processed"'), msgtype: 'm.text' },
        },
      });
    });
  });

  describe('matrixMessageReceivedEpic', () => {
    test('receive: success on late presence and late room', async () => {
      expect.assertions(1);
      // Gets a log.warn(`Could not decode message: ${line}: ${err}`);
      // at Object.parseMessage (src/transport/epics/helpers.ts:203:9)
      const roomId = partnerRoomId,
        message = 'test message';
      const [raiden, partner] = await makeRaidens(2);
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;

      matrix.emit(
        'Room.timeline',
        {
          getType: () => 'm.room.message',
          getSender: () => partnerMatrix.getUserId(),
          getContent: () => ({ msgtype: 'm.text', body: message }),
          event: {
            content: { msgtype: 'm.text', body: message },
            origin_server_ts: 123,
          },
        },
        { roomId, getCanonicalAlias: jest.fn(), getAliases: jest.fn(() => []) },
      );

      // actions sees presence update for partner only later
      raiden.store.dispatch(
        matrixPresence.success(
          { userId: partnerMatrix.getUserId()!, available: true, ts: Date.now() },
          { address: partner.address },
        ),
      );
      // state includes room for partner only later
      raiden.store.dispatch(matrixRoom({ roomId }, { address: partner.address }));

      await sleep(2 * raiden.config.pollingInterval);
      expect(raiden.output).toContainEqual(
        messageReceived(
          {
            text: message,
            ts: expect.any(Number),
            userId: partnerMatrix.getUserId()!,
            roomId,
          },
          { address: partner.address },
        ),
      );
    });

    test('receive: decode signed message', async () => {
      expect.assertions(1);

      const roomId = partnerRoomId;
      const [raiden, partner] = await makeRaidens(2);
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const signed = await signMessage(partner.deps.signer, processed);
      const message = encodeJsonMessage(signed);

      raiden.store.dispatch(
        matrixPresence.success(
          { userId: partnerMatrix.getUserId()!, available: true, ts: Date.now() },
          { address: partner.address },
        ),
      );
      raiden.store.dispatch(matrixRoom({ roomId }, { address: partner.address }));

      await sleep(2 * raiden.config.pollingInterval);
      matrix.emit(
        'Room.timeline',
        {
          getType: () => 'm.room.message',
          getSender: () => partnerMatrix.getUserId(),
          getContent: () => ({ msgtype: 'm.text', body: message }),
          event: {
            content: { msgtype: 'm.text', body: message },
            origin_server_ts: 123,
          },
        },
        { roomId, getCanonicalAlias: jest.fn(), getAliases: jest.fn(() => []) },
      );

      await sleep(4 * raiden.config.pollingInterval);
      expect(raiden.output).toContainEqual(
        messageReceived(
          {
            text: message,
            message: {
              type: MessageType.PROCESSED,
              message_identifier: expect.any(BigNumber),
              signature: expect.any(String),
            },
            ts: expect.any(Number),
            userId: partnerMatrix.getUserId()!,
            roomId,
          },
          { address: partner.address },
        ),
      );
    });

    test("receive: messages from wrong sender aren't decoded", async () => {
      expect.assertions(1);

      const roomId = partnerRoomId;
      // signed by ourselves
      const [raiden, partner] = await makeRaidens(2);
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const signed = await signMessage(raiden.deps.signer, processed);
      const message = encodeJsonMessage(signed);

      raiden.store.dispatch(
        matrixPresence.success(
          { userId: partnerMatrix.getUserId()!, available: true, ts: Date.now() },
          { address: partner.address },
        ),
      );
      raiden.store.dispatch(matrixRoom({ roomId }, { address: partner.address }));

      await sleep(2 * raiden.config.pollingInterval);
      matrix.emit(
        'Room.timeline',
        {
          getType: () => 'm.room.message',
          getSender: () => partnerMatrix.getUserId(),
          getContent: () => ({ msgtype: 'm.text', body: message }),
          event: {
            content: { msgtype: 'm.text', body: message },
            origin_server_ts: 123,
          },
        },
        { roomId, getCanonicalAlias: jest.fn(), getAliases: jest.fn(() => []) },
      );

      await sleep(4 * raiden.config.pollingInterval);
      expect(raiden.output).toContainEqual(
        messageReceived(
          {
            text: message,
            message: undefined,
            ts: expect.any(Number),
            userId: partnerMatrix.getUserId()!,
            roomId,
          },
          { address: partner.address },
        ),
      );
    });

    test('receive: toDevice', async () => {
      expect.assertions(1);

      const message = 'test message',
        content = { msgtype: 'm.text', body: message };

      const [raiden, partner] = await makeRaidens(2);
      const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      raiden.store.dispatch(raidenConfigUpdate({ caps: { [Capabilities.TO_DEVICE]: 1 } }));

      matrix.emit('toDeviceEvent', {
        getType: jest.fn(() => 'm.room.message'),
        getSender: jest.fn(() => partnerMatrix.getUserId()),
        getContent: jest.fn(() => content),
        event: { type: 'm.room.message', sender: partnerMatrix.getUserId(), content },
      });

      // actions sees presence update for partner only later
      raiden.store.dispatch(
        matrixPresence.success(
          {
            userId: partnerMatrix.getUserId()!,
            available: true,
            ts: Date.now(),
            caps: { [Capabilities.TO_DEVICE]: 1 },
          },
          { address: partner.address },
        ),
      );

      await sleep(4 * raiden.config.pollingInterval);
      expect(raiden.output).toContainEqual(
        messageReceived(
          {
            text: message,
            ts: expect.any(Number),
            userId: partnerMatrix.getUserId()!,
          },
          { address: partner.address },
        ),
      );
    });
  });

  describe('matrixMessageReceivedUpdateRoomEpic', () => {
    test('messageReceived on second room emits matrixRoom', async () => {
      expect.assertions(2);

      const roomId = partnerRoomId;
      const newRoomId = `!newRoomId_for_partner:${matrixServer}`;
      const [raiden, partner] = await makeRaidens(2);
      const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      raiden.store.dispatch(matrixRoom({ roomId }, { address: partner.address }));
      raiden.store.dispatch(matrixRoom({ roomId: newRoomId }, { address: partner.address }));

      expect(raiden.store.getState().transport.rooms).toMatchObject({
        [partner.address]: [newRoomId, partnerRoomId],
      });

      const sliceLength = raiden.output.length;
      raiden.store.dispatch(
        messageReceived(
          { text: 'test message', ts: 123, userId: partnerMatrix.getUserId()!, roomId },
          { address: partner.address },
        ),
      );

      await sleep(2 * raiden.config.pollingInterval);
      expect(raiden.output.slice(sliceLength)).toContainEqual(
        matrixRoom({ roomId }, { address: partner.address }),
      );
    });
  });

  describe('deliveredEpic', () => {
    test('success with cached', async () => {
      expect.assertions(3);

      const [raiden, partner] = await makeRaidens(2);
      const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const message: Signed<Processed> = {
          type: MessageType.PROCESSED,
          message_identifier: makeMessageId(),
          signature: makeSignature(),
        },
        roomId = partnerRoomId,
        messageReceivedAction = messageReceived(
          {
            text: encodeJsonMessage(message),
            message,
            ts: 123,
            userId: partnerMatrix.getUserId()!,
            roomId,
          },
          { address: partner.address },
        );

      // set status as available in latest$.presences
      raiden.store.dispatch(
        matrixPresence.success(
          { userId: partnerMatrix.getUserId()!, available: true, ts: Date.now() },
          { address: partner.address },
        ),
      );
      const signerSpy = jest.spyOn(raiden.deps.signer, 'signMessage');

      await sleep(2 * raiden.config.pollingInterval);
      raiden.store.dispatch(messageReceivedAction);
      raiden.store.dispatch(messageReceivedAction);

      await sleep(2 * raiden.config.pollingInterval);
      const messageSendAction = messageSend.request(
        {
          message: {
            type: MessageType.DELIVERED,
            delivered_message_identifier: message.message_identifier,
            signature: expect.any(String),
          },
        },
        { address: partner.address, msgId: message.message_identifier.toString() },
      );
      expect(raiden.output).toContainEqual(messageSendAction);
      expect(raiden.output).toEqual(
        expect.arrayContaining([messageSendAction, messageSendAction]),
      );
      expect(signerSpy).toHaveBeenCalledTimes(1);
      signerSpy.mockRestore();
    });

    test('skip if partner supports !Capabilities.DELIVERY', async () => {
      expect.assertions(2);

      const [raiden, partner] = await makeRaidens(2);
      const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      const message: Signed<Processed> = {
          type: MessageType.PROCESSED,
          message_identifier: makeMessageId(),
          signature: makeSignature(),
        },
        roomId = partnerRoomId,
        messageReceivedAction = messageReceived(
          {
            text: encodeJsonMessage(message),
            message,
            ts: 123,
            userId: partnerMatrix.getUserId()!,
            roomId,
          },
          { address: partner.address },
        );

      // set status as available in latest$.presences
      raiden.store.dispatch(
        matrixPresence.success(
          {
            userId: partnerMatrix.getUserId()!,
            available: true,
            ts: Date.now(),
            caps: { [Capabilities.DELIVERY]: 0 },
          },
          { address: partner.address },
        ),
      );

      const signerSpy = jest.spyOn(raiden.deps.signer, 'signMessage');

      await sleep(2 * raiden.config.pollingInterval);
      raiden.store.dispatch(messageReceivedAction);
      raiden.store.dispatch(messageReceivedAction);

      await sleep(2 * raiden.config.pollingInterval);
      const messageSendAction = messageSend.request(expect.anything(), expect.anything());
      expect(raiden.output).not.toContainEqual(messageSendAction);
      expect(signerSpy).toHaveBeenCalledTimes(0);
      signerSpy.mockRestore();
    });

    test('do not reply if not message type which should be replied', async () => {
      expect.assertions(2);

      const [raiden, partner] = await makeRaidens(2);
      const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      // Delivered messages aren't in the set of messages which get replied with a Delivered
      const message: Signed<Delivered> = {
          type: MessageType.DELIVERED,
          delivered_message_identifier: makeMessageId(),
          signature: makeSignature(),
        },
        roomId = partnerRoomId,
        messageReceivedAction = messageReceived(
          {
            text: encodeJsonMessage(message),
            message,
            ts: 123,
            userId: partnerMatrix.getUserId()!,
            roomId,
          },
          { address: partner.address },
        );

      const signerSpy = jest.spyOn(raiden.deps.signer, 'signMessage');

      await sleep(2 * raiden.config.pollingInterval);
      raiden.store.dispatch(messageReceivedAction);

      await sleep(2 * raiden.config.pollingInterval);
      const messageSendAction = messageSend.request(expect.anything(), expect.anything());
      expect(raiden.output).not.toContainEqual(messageSendAction);
      expect(signerSpy).toHaveBeenCalledTimes(0);
      signerSpy.mockRestore();
    });
  });

  test('matrixMessageGlobalSendEpic', async () => {
    expect.assertions(5);

    const [raiden, partner] = await makeRaidens(2);
    const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
    const message = await signMessage(partner.deps.signer, processed),
      text = encodeJsonMessage(message);

    raiden.store.dispatch(messageGlobalSend({ message }, { roomName: 'unknown_global_room' }));

    expect(matrix.sendEvent).toHaveBeenCalledTimes(0);

    let discoveryRoom!: string;
    raiden.deps.latest$
      .pipe(first())
      .subscribe(({ config }) => (discoveryRoom = config.discoveryRoom!));

    raiden.store.dispatch(messageGlobalSend({ message }, { roomName: discoveryRoom }));

    await sleep(2 * raiden.config.pollingInterval);
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

    raiden.store.dispatch(messageGlobalSend({ message }, { roomName: discoveryRoom }));

    await sleep(2 * raiden.config.pollingInterval);
    expect(matrix.sendEvent).toHaveBeenCalledTimes(1);
    expect(matrix.sendEvent).toHaveBeenCalledWith(
      expect.any(String),
      'm.room.message',
      expect.objectContaining({ body: text, msgtype: 'm.text' }),
      expect.anything(),
    );
  });

  describe('rtcConnectEpic', () => {
    let raiden: MockedRaiden, partner: MockedRaiden;
    let matrix: jest.Mocked<MatrixClient>, partnerMatrix: jest.Mocked<MatrixClient>;
    const createPartnerPresence = (available: boolean, webRtcCapable: boolean) =>
      matrixPresence.success(
        {
          userId: partnerMatrix.getUserId()!,
          available,
          ts: Date.now(),
          caps: { [Capabilities.WEBRTC]: webRtcCapable ? 1 : 0 },
        },
        { address: partner.address },
      );
    let rtcConnection: ReturnType<typeof mockRTC>['rtcConnection'];
    let rtcDataChannel: ReturnType<typeof mockRTC>['rtcDataChannel'];
    let RTCPeerConnection: ReturnType<typeof mockRTC>['RTCPeerConnection'];

    beforeEach(async () => {
      [raiden, partner] = await makeRaidens(2);
      matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
      ({ rtcConnection, rtcDataChannel, RTCPeerConnection } = mockRTC());
      raiden.store.dispatch(
        raidenConfigUpdate({
          httpTimeout: 300,
          caps: { [Capabilities.DELIVERY]: 0, [Capabilities.WEBRTC]: 1 },
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
              userId: partnerMatrix.getUserId()!,
            })),
            getJoinedMembers: jest.fn(),
            getCanonicalAlias: jest.fn(() => partnerRoomId),
            getAliases: jest.fn(() => []),
          } as any),
      );
    });

    afterEach(() => {
      RTCPeerConnection.mockRestore();
      jest.clearAllMocks();
      [raiden, partner].forEach((node) => {
        node.deps.latest$.complete();
        node.stop();
      });
    });

    test('skip if no webrtc capability exists', async () => {
      raiden.store.dispatch(createPartnerPresence(false, false));
      raiden.store.dispatch(createPartnerPresence(true, false));

      await sleep(2 * raiden.config.pollingInterval);
      expect(raiden.output).not.toContainEqual(rtcChannel(expect.anything(), expect.anything()));
    });

    test('reset data channel if user goes offline in matrix', async () => {
      raiden.store.dispatch(createPartnerPresence(true, true));
      raiden.store.dispatch(createPartnerPresence(false, true));

      await sleep(2 * raiden.config.pollingInterval);
      expect(raiden.output).toContainEqual(rtcChannel(undefined, { address: partner.address }));
    });

    test('set up caller data channel and waits for partner to join room', async () => {
      raiden.store.dispatch(createPartnerPresence(true, true));
      raiden.store.dispatch(
        matrixRoom({ roomId: matrix.getUserId()! }, { address: partner.address }),
      );
      raiden.store.dispatch(createPartnerPresence(false, true));

      await sleep(2 * raiden.config.pollingInterval);
      expect(raiden.output).toContainEqual(rtcChannel(undefined, { address: partner.address }));
    });

    test('success callee, receive message & channel error', async () => {
      expect.assertions(2);

      const msg = '{"type":"Delivered","delivered_message_identifier":"123456"}';

      setTimeout(() => {
        matrix.emit(
          'Room.timeline',
          {
            getType: () => 'm.room.message',
            getSender: () => partnerMatrix.getUserId(),
            getContent: () => ({
              msgtype: 'm.notice',
              body: jsonStringify({
                type: 'offer',
                call_id: `${partner.address}|${raiden.address}`.toLowerCase(),
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
        raiden.store.dispatch(
          matrixPresence.success(
            {
              userId: partnerMatrix.getUserId()!,
              available: false,
              ts: Date.now(),
            },
            { address: partner.address },
          ),
        );
      }, 100);

      raiden.store.dispatch(matrixRoom({ roomId: partnerRoomId }, { address: partner.address }));
      raiden.store.dispatch(
        matrixPresence.success(
          {
            userId: partnerMatrix.getUserId()!,
            available: true,
            ts: Date.now(),
            caps: { [Capabilities.WEBRTC]: 1 },
          },
          { address: partner.address },
        ),
      );

      await sleep(10 * raiden.config.pollingInterval);
      expect(raiden.output).toEqual(
        expect.arrayContaining([
          rtcChannel(rtcDataChannel, { address: partner.address }),
          messageReceived(
            {
              text: expect.any(String),
              ts: expect.any(Number),
              message: expect.objectContaining({ type: MessageType.DELIVERED }),
              userId: partnerMatrix.getUserId()!,
              roomId: undefined,
            },
            { address: partner.address },
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

      matrix.sendEvent.mockImplementation(async ({}, type: string, content: any) => {
        if (type !== 'm.room.message' || content?.msgtype !== 'm.notice') return;
        const body = jsonParse(content.body);
        setTimeout(() => {
          matrix.emit(
            'Room.timeline',
            {
              getType: () => 'm.room.message',
              getSender: () => partnerMatrix.getUserId()!,
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
              getSender: () => partnerMatrix.getUserId()!,
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
          rtcDataChannel.emit('message', { data: 'ping' });
        }, 40);
        setTimeout(() => {
          rtcDataChannel.emit('close', true);
        }, 70);
      });
      rtcConnection.addIceCandidate.mockRejectedValueOnce(new Error('addIceCandidate failed'));

      raiden.store.dispatch(matrixRoom({ roomId: partnerRoomId }, { address: partner.address }));
      raiden.store.dispatch(
        matrixPresence.success(
          {
            userId: partnerMatrix.getUserId()!,
            available: true,
            ts: Date.now(),
            caps: { [Capabilities.WEBRTC]: 1 },
          },
          { address: partner.address },
        ),
      );

      await sleep(100 * raiden.config.pollingInterval);
      expect(raiden.output).toEqual(
        expect.arrayContaining([
          rtcChannel(rtcDataChannel, { address: partner.address }),
          rtcChannel(undefined, { address: partner.address }),
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
