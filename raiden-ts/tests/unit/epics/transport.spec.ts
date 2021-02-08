/* eslint-disable @typescript-eslint/no-explicit-any */

import { makeSignature, makeRaiden, makeRaidens, MockedRaiden, sleep, fetch } from '../mocks';
import { ensureChannelIsOpen, token, matrixServer } from '../fixtures';

import { EventEmitter } from 'events';
import { MatrixClient } from 'matrix-js-sdk';
import { first, pluck } from 'rxjs/operators';
import { verifyMessage } from '@ethersproject/wallet';
import { raidenConfigUpdate, raidenShutdown } from 'raiden-ts/actions';

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
import { Address, isntNil, Signed } from 'raiden-ts/utils/types';
import { Capabilities } from 'raiden-ts/constants';
import { ErrorCodes } from 'raiden-ts/utils/error';
import { getSortedAddresses } from 'raiden-ts/transport/utils';

const partnerRoomId = `!partnerRoomId:${matrixServer}`;
const accessToken = 'access_token';
const deviceId = 'device_id';
const processed: Processed = {
  type: MessageType.PROCESSED,
  message_identifier: makeMessageId(),
};

function getSortedClients<C extends { address: Address }[]>(clients: C): C {
  const addresses = getSortedAddresses(...clients.map(({ address }) => address));
  return [...clients].sort(
    (a, b) => addresses.indexOf(a.address) - addresses.indexOf(b.address),
  ) as C;
}

type MockedDataChannel = jest.Mocked<RTCDataChannel & EventEmitter>;
type MockedPeerConnection = jest.Mocked<RTCPeerConnection & EventEmitter>;

/**
 * Spies and mocks classes constructors on globalThis
 *
 * @returns Mocked spies
 */
function mockRTC() {
  const RTCPeerConnection = jest.spyOn(globalThis, 'RTCPeerConnection').mockImplementation(() => {
    class RTCDataChannel extends EventEmitter {
      readyState = 'unknown';
      close = jest.fn();
      send = jest.fn();
    }
    const channel = (new RTCDataChannel() as unknown) as MockedDataChannel;

    class RTCPeerConnection extends EventEmitter {
      createDataChannel = jest.fn(() => channel);
      createOffer = jest.fn(async () => ({ type: 'offer', sdp: 'offerSdp' }));
      createAnswer = jest.fn(async () => ({ type: 'answer', sdp: 'answerSdp' }));
      setLocalDescription = jest.fn(async () => {
        setTimeout(() => {
          connection.emit('icecandidate', { candidate: 'candidate1Fail' });
          connection.emit('icecandidate', { candidate: 'myCandidate' });
          connection.emit('icecandidate', { candidate: null });
        }, 5);
      });
      setRemoteDescription = jest.fn(async () => {
        /* remote */
      });
      addIceCandidate = jest.fn(async () => {
        setTimeout(() => connection.emit('datachannel', { channel }), 2);
        setTimeout(() => {
          Object.assign(channel, { readyState: 'open' });
          channel.emit('open', true);
        }, 5);
        setTimeout(() => channel.emit('message', { data: 'ping' }), 12);
      });
      close = jest.fn();
    }
    const connection = (new RTCPeerConnection() as unknown) as MockedPeerConnection;
    connection.addIceCandidate.mockRejectedValueOnce(new Error('addIceCandidate failed'));

    return connection;
  });

  return RTCPeerConnection;
}

describe('initMatrixEpic', () => {
  let raiden: MockedRaiden;

  beforeEach(async () => {
    fetch.mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: jest.fn<Promise<unknown>, []>(async () => ({
        active_servers: [matrixServer],
        all_servers: [],
      })),
    }));
    raiden = await makeRaiden(undefined, false);
  });

  afterEach(() => jest.restoreAllMocks());

  test('matrix stored setup', async () => {
    expect.assertions(5);

    const userId = `@${raiden.address.toLowerCase()}:${matrixServer}`;
    const displayName = await raiden.deps.signer.signMessage(userId);
    const setupPayload = {
      server: `https://${matrixServer}`,
      setup: {
        userId,
        accessToken,
        deviceId,
        displayName,
      },
    };
    // since this is called before start, it sets the state but doesn't go to output
    raiden.store.dispatch(raidenConfigUpdate({ httpTimeout: 30 }));
    raiden.store.dispatch(matrixSetup(setupPayload));

    await raiden.start();
    await sleep();
    const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;

    expect(raiden.output).toContainEqual(matrixSetup(setupPayload));
    expect(matrix.setPushRuleEnabled).toHaveBeenCalledWith(
      'global',
      'override',
      '.m.rule.master',
      true,
    );
    // ensure if stored setup works, servers list don't need to be fetched
    expect(fetch).not.toHaveBeenCalled();

    // test presence got set again after some time, to overcome presence bug
    expect(matrix.setPresence).not.toHaveBeenCalled();
    await sleep(2 * raiden.config.httpTimeout);
    expect(matrix.setPresence).toHaveBeenCalledWith({
      presence: 'online',
      status_msg: expect.any(String),
    });
  });

  test('matrix server config set without stored setup', async () => {
    expect.assertions(2);

    const matrixServer = 'mycustom.matrix.server';
    raiden.store.dispatch(raidenConfigUpdate({ matrixServer: `https://${matrixServer}` }));
    await raiden.start();
    await sleep();

    expect(raiden.output).toContainEqual(
      matrixSetup({
        server: `https://${matrixServer}`,
        setup: {
          userId: `@${raiden.address.toLowerCase()}:${matrixServer}`,
          accessToken: expect.any(String),
          deviceId: expect.any(String),
          displayName: expect.any(String),
        },
      }),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  test('matrix server config set same as stored setup', async () => {
    expect.assertions(2);

    const matrixServer = 'mycustom.matrix.server';
    const userId = `@${raiden.address.toLowerCase()}:${matrixServer}`;
    const displayName = await raiden.deps.signer.signMessage(userId);
    const setupPayload = {
      server: `https://${matrixServer}`,
      setup: {
        userId,
        accessToken,
        deviceId,
        displayName,
      },
    };
    // since this is called before start, it sets the state but doesn't go to output
    raiden.store.dispatch(matrixSetup(setupPayload));
    raiden.store.dispatch(raidenConfigUpdate({ matrixServer: `https://${matrixServer}` }));

    await raiden.start();
    await sleep();

    expect(raiden.output).toContainEqual(matrixSetup(setupPayload));
    // ensure if stored setup works, servers list don't need to be fetched
    expect(fetch).not.toHaveBeenCalled();
  });

  test('matrix fetch servers list', async () => {
    expect.assertions(2);

    // make the matrixServer falsy otherwise fetchSortedMatrixServers$
    // inside initMatrixEpic is not called. This will force fetching server list
    raiden.store.dispatch(raidenConfigUpdate({ matrixServer: '' }));
    await raiden.start();
    await sleep();

    expect(raiden.output).toContainEqual(
      matrixSetup({
        server: `https://${matrixServer}`,
        setup: {
          userId: `@${raiden.address.toLowerCase()}:${matrixServer}`,
          accessToken: expect.any(String),
          deviceId: expect.any(String),
          displayName: expect.any(String),
        },
      }),
    );
    expect(fetch).toHaveBeenCalledTimes(2); // list + rtt
  });

  test('matrix throws if can not fetch servers list', async () => {
    expect.assertions(3);

    // Can't fetch server list
    fetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: jest.fn(async () => ({})),
    });
    raiden.store.dispatch(raidenConfigUpdate({ matrixServer: '' }));

    await raiden.start();

    expect(raiden.started).toBeFalsy();
    expect(raiden.output).toContainEqual(
      raidenShutdown({
        reason: expect.objectContaining({
          message: expect.stringContaining('Could not fetch server list'),
        }),
      }),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('matrix throws if can not contact any server from list', async () => {
    expect.assertions(3);

    // error matrixRTT
    fetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: jest.fn(async () => ({})),
    });
    // but first, succeed on fetch list
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => ({
        active_servers: [matrixServer],
        all_servers: [],
      })),
    });

    // set fetch list from matrixServerLookup
    raiden.store.dispatch(raidenConfigUpdate({ matrixServer: '' }));
    await raiden.start();
    await sleep();

    expect(raiden.started).toBeFalsy();
    expect(raiden.output).toContainEqual(
      raidenShutdown({
        reason: expect.objectContaining({
          message: ErrorCodes.TRNS_NO_MATRIX_SERVERS,
        }),
      }),
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

test('channelMonitored triggers matrixPresence.request', async () => {
  const [raiden, partner] = await makeRaidens(2);
  await ensureChannelIsOpen([raiden, partner]);

  expect(raiden.output).toContainEqual(
    matrixPresence.request(undefined, { address: partner.address }),
  );
});

test('matrixShutdownEpic: stopClient called on action$ completion', async () => {
  expect.assertions(2);
  const raiden = await makeRaiden(undefined);
  const matrix = await raiden.deps.matrix$.toPromise();
  expect(matrix.stopClient).not.toHaveBeenCalled();
  raiden.stop();
  expect(matrix.stopClient).toHaveBeenCalledTimes(1);
});

describe('matrixMonitorPresenceEpic', () => {
  test('fails when users does not have displayName', async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
    const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
    matrix.searchUserDirectory.mockImplementationOnce(async () => ({
      limited: false,
      results: [{ user_id: partnerMatrix.getUserId()! }],
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

    matrix.searchUserDirectory.mockImplementation(async () => ({
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
    matrix.searchUserDirectory.mockImplementation(async () => ({
      limited: false,
      results: [{ user_id: partnerMatrix.getUserId()!, display_name: 'display_name' }],
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

    matrix.searchUserDirectory.mockImplementation(async () => ({
      limited: false,
      results: [{ user_id: partnerMatrix.getUserId()!, display_name: 'display_name' }],
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
    matrix.searchUserDirectory.mockImplementation(async ({ term }) => ({
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
    matrix.searchUserDirectory.mockImplementationOnce(async () => ({
      limited: false,
      results: [
        { user_id: `@${partner.address.toLowerCase()}.2:${matrixServer}`, display_name: '2' },
        { user_id: partnerMatrix.getUserId()!, display_name: '1' },
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
    await sleep(2 * raiden.config.pollingInterval);

    matrix.getProfileInfo.mockResolvedValueOnce({
      displayname: `${matrix.getUserId()}_display_name`,
      avatar_url: `mxc://raiden.network/cap?Delivery=0`,
    });

    const presence = {
      presence: 'offline',
      last_active_ago: 123,
    };
    matrix._http.authedRequest.mockResolvedValueOnce(presence);

    matrix.emit('event', {
      getType: () => 'm.presence',
      getSender: () => partnerMatrix.getUserId(),
      getContent: () => presence,
    });

    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      matrixPresence.success(
        {
          userId: partnerMatrix.getUserId()!,
          available: false,
          ts: expect.any(Number),
          caps: expect.objectContaining({ [Capabilities.DELIVERY]: 0 }),
        },
        { address: partner.address },
      ),
    );
  });

  test('getProfileInfo error', async () => {
    // need to check this test again
    expect.assertions(2);

    const [raiden, partner] = await makeRaidens(2);
    const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
    const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;

    raiden.store.dispatch(matrixPresence.request(undefined, { address: partner.address }));
    await sleep(raiden.config.httpTimeout);
    expect(raiden.output).toContainEqual(
      matrixPresence.success(
        expect.objectContaining({ available: true, userId: partnerMatrix.getUserId()! }),
        { address: partner.address },
      ),
    );
    raiden.output.splice(0, raiden.output.length);

    matrix.getProfileInfo.mockRejectedValue(new Error('could not get user profile'));
    matrix.emit('event', {
      getType: () => 'm.presence',
      getSender: () => partnerMatrix.getUserId(),
    });

    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).not.toContainEqual(
      matrixPresence.success(expect.anything(), expect.anything()),
    );
  });
});

test('matrixUpdateCapsEpic', async () => {
  // Please check this test thoroughly whether we are testing the right things
  expect.assertions(5);

  const raiden = await makeRaiden();
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
  expect(matrix.setAvatarUrl).toHaveBeenCalledTimes(3);
  expect(matrix.setAvatarUrl).toHaveBeenCalledWith(
    expect.stringMatching(`mxc://raiden.network/cap?.*${Capabilities.DELIVERY}=1`),
  );

  raiden.store.dispatch(raidenConfigUpdate({ caps: { customCap: 'abc' } }));

  await sleep(2 * raiden.config.pollingInterval);
  expect(matrix.setAvatarUrl).toHaveBeenCalledTimes(4);
  expect(matrix.setAvatarUrl).toHaveBeenCalledWith(
    expect.stringMatching(`mxc://raiden.network/cap?.*${Capabilities.DELIVERY}=0&.*customCap=abc`),
  );
});

test('matrixCreateRoomEpic', async () => {
  expect.assertions(3);
  // ensure raiden is inviter, partner is invitee
  const [raiden, partner] = getSortedClients(await makeRaidens(2));
  const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
  const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;

  await ensureChannelIsOpen([raiden, partner]);

  await sleep(2 * raiden.config.pollingInterval);
  expect(raiden.output).toContainEqual(
    matrixRoom(
      { roomId: expect.stringMatching(new RegExp(`^!.*:${matrixServer}$`)) },
      { address: partner.address },
    ),
  );
  expect(matrix.createRoom).toHaveBeenCalledTimes(1);
  // invitee doesn't invite
  expect(partnerMatrix.createRoom).not.toHaveBeenCalled();
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
    await sleep();
    expect(matrix.invite).not.toHaveBeenCalled();
  });

  test('invite if there is room for user', async () => {
    expect.assertions(2);
    const [raiden, partner] = getSortedClients(await makeRaidens(2));
    const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
    const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
    const roomId = partnerRoomId;
    raiden.store.dispatch(matrixRoom({ roomId }, { address: partner.address }));
    // partner joins when they're invited the second time
    matrix.invite.mockResolvedValueOnce(Promise.resolve());

    raiden.store.dispatch(matrixPresence.request(undefined, { address: partner.address }));

    await sleep(2 * raiden.config.httpTimeout);
    expect(matrix.invite).toHaveBeenCalledTimes(2);
    expect(matrix.invite).toHaveBeenCalledWith(roomId, partnerMatrix.getUserId()!);
  });
});

describe('matrixHandleInvitesEpic', () => {
  test('accept & join', async () => {
    expect.assertions(4);
    const [partner, raiden] = getSortedClients(await makeRaidens(2));
    const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;

    await ensureChannelIsOpen([raiden, partner]);
    await sleep();

    expect(partner.output).toContainEqual(
      matrixRoom({ roomId: expect.stringMatching(/!.*:/) }, { address: raiden.address }),
    );
    const roomId = partner.output.find(matrixRoom.is)!.payload.roomId;
    expect(raiden.output).toContainEqual(matrixRoom({ roomId }, { address: partner.address }));
    expect(matrix.joinRoom).toHaveBeenCalledTimes(4);
    expect(matrix.joinRoom).toHaveBeenCalledWith(
      roomId,
      expect.objectContaining({ syncRoom: true }),
    );
  });

  test('do not accept invites from non-monitored peers', async () => {
    expect.assertions(2);

    const [partner, raiden] = getSortedClients(await makeRaidens(2));
    const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
    const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;

    const { room_id: roomId } = await partnerMatrix.createRoom({ invite: [matrix.getUserId()!] });
    await sleep();

    expect(partnerMatrix.getRoom(roomId)?.getMember(matrix.getUserId()!)).toMatchObject({
      membership: 'invite',
    });
    expect(matrix.joinRoom).not.toHaveBeenCalledWith(roomId, expect.anything());
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
  test('success: errors once but retries successfully', async () => {
    expect.assertions(4);

    const [raiden, partner] = getSortedClients(await makeRaidens(2));
    raiden.store.dispatch(raidenConfigUpdate({ httpTimeout: 30 }));
    const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;

    const message: Processed = {
        type: MessageType.PROCESSED,
        message_identifier: makeMessageId(),
      },
      signed = await signMessage(raiden.deps.signer, message);

    await ensureChannelIsOpen([raiden, partner]);
    await sleep();
    matrix.sendEvent.mockClear();

    const roomId = raiden.store.getState().transport.rooms?.[partner.address][0];
    expect(roomId).toMatch(/!.*:/);

    matrix.sendEvent.mockRejectedValueOnce(
      Object.assign(new Error('Failed'), { httpStatus: 500 }),
    );
    raiden.store.dispatch(
      messageSend.request(
        { message: signed },
        { address: partner.address, msgId: signed.message_identifier.toString() },
      ),
    );

    await sleep(100);
    expect(raiden.output).toContainEqual(
      messageSend.success(expect.objectContaining({ via: expect.stringMatching(/^!/) }), {
        address: partner.address,
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

  test('sendEvent fails', async () => {
    expect.assertions(4);

    const message = 'Hello world!';
    const [raiden, partner] = getSortedClients(await makeRaidens(2));
    raiden.store.dispatch(raidenConfigUpdate({ httpTimeout: 30 }));
    const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;

    await ensureChannelIsOpen([raiden, partner]);
    await sleep();
    matrix.sendEvent.mockClear();

    const roomId = raiden.store.getState().transport.rooms?.[partner.address][0];
    expect(roomId).toMatch(/!.*:/);
    matrix.sendEvent
      .mockRejectedValueOnce(Object.assign(new Error('Failed 1'), { httpStatus: 500 }))
      .mockRejectedValueOnce(Object.assign(new Error('Failed 2'), { httpStatus: 500 }))
      .mockRejectedValueOnce(Object.assign(new Error('Failed 3'), { httpStatus: 500 }))
      .mockRejectedValueOnce(Object.assign(new Error('Failed 4'), { httpStatus: 500 }));

    raiden.store.dispatch(
      messageSend.request({ message }, { address: partner.address, msgId: message }),
    );

    await sleep(200);
    expect(raiden.output).toContainEqual(
      messageSend.failure(expect.objectContaining({ message: 'Failed 4' }), {
        address: partner.address,
        msgId: message,
      }),
    );
    expect(matrix.sendEvent).toHaveBeenCalledTimes(4);
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

    const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
    const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
    const message = await signMessage(raiden.deps.signer, processed);

    raiden.store.dispatch(raidenConfigUpdate({ caps: { [Capabilities.TO_DEVICE]: 1 } }));
    partner.store.dispatch(raidenConfigUpdate({ caps: { [Capabilities.TO_DEVICE]: 1 } }));

    raiden.store.dispatch(matrixPresence.request(undefined, { address: partner.address }));
    partner.store.dispatch(matrixPresence.request(undefined, { address: raiden.address }));

    // fail once, succeed on retry
    matrix.sendToDevice.mockRejectedValueOnce(
      Object.assign(new Error('Failed'), { httpStatus: 500 }),
    );
    raiden.store.dispatch(
      messageSend.request(
        { message },
        { address: partner.address, msgId: message.message_identifier.toString() },
      ),
    );

    await sleep(6 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      messageSend.success(expect.objectContaining({ via: expect.stringMatching(/^@0x/) }), {
        address: partner.address,
        msgId: message.message_identifier.toString(),
      }),
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
  test('receive: success', async () => {
    expect.assertions(2);
    // Gets a log.warn(`Could not decode message: ${line}: ${err}`);
    // at Object.parseMessage (src/transport/epics/helpers.ts:203:9)
    const message = 'test message';
    const [raiden, partner] = getSortedClients(await makeRaidens(2));
    const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;

    await ensureChannelIsOpen([raiden, partner]);
    await sleep();

    const roomId = raiden.store.getState().transport.rooms?.[partner.address][0];
    expect(roomId).toMatch(/!.*:/);

    partner.store.dispatch(
      messageSend.request({ message }, { address: raiden.address, msgId: message }),
    );
    await sleep(raiden.config.httpTimeout);

    expect(raiden.output).toContainEqual(
      messageReceived(
        {
          text: message,
          msgtype: 'm.text',
          ts: expect.any(Number),
          userId: partnerMatrix.getUserId()!,
          roomId,
        },
        { address: partner.address },
      ),
    );
  });

  test('receive: decode signed message', async () => {
    expect.assertions(2);

    const [raiden, partner] = await makeRaidens(2);
    const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
    const signed = await signMessage(partner.deps.signer, processed);
    const message = encodeJsonMessage(signed);

    await ensureChannelIsOpen([raiden, partner]);
    await sleep();

    const roomId = raiden.store.getState().transport.rooms?.[partner.address][0];
    expect(roomId).toMatch(/!.*:/);

    partner.store.dispatch(
      messageSend.request({ message }, { address: raiden.address, msgId: message }),
    );
    await sleep(raiden.config.httpTimeout);
    expect(raiden.output).toContainEqual(
      messageReceived(
        {
          text: message,
          message: signed,
          msgtype: 'm.text',
          ts: expect.any(Number),
          userId: partnerMatrix.getUserId()!,
          roomId,
        },
        { address: partner.address },
      ),
    );
  });

  test("receive: messages from wrong sender aren't decoded", async () => {
    expect.assertions(2);

    const [raiden, partner] = await makeRaidens(2);
    const partnerMatrix = (await partner.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
    // signed by ourselves
    const signed = await signMessage(raiden.deps.signer, processed);
    const message = encodeJsonMessage(signed);

    await ensureChannelIsOpen([raiden, partner]);
    await sleep();

    const roomId = raiden.store.getState().transport.rooms?.[partner.address][0];
    expect(roomId).toMatch(/!.*:/);

    partner.store.dispatch(
      messageSend.request({ message }, { address: raiden.address, msgId: message }),
    );
    await sleep(raiden.config.httpTimeout);

    expect(raiden.output).toContainEqual(
      messageReceived(
        {
          text: message,
          message: undefined,
          msgtype: 'm.text',
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

    await sleep();
    expect(raiden.output).toContainEqual(
      messageReceived(
        {
          text: message,
          msgtype: 'm.text',
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
    expect(raiden.output).toEqual(expect.arrayContaining([messageSendAction, messageSendAction]));
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
  expect.assertions(9);

  const raiden = await makeRaiden();
  const matrix = (await raiden.deps.matrix$.toPromise()) as jest.Mocked<MatrixClient>;
  const msgId = '123';
  const message = await signMessage(raiden.deps.signer, processed),
    text = encodeJsonMessage(message);

  raiden.store.dispatch(
    messageGlobalSend.request({ message }, { roomName: 'unknown_global_room', msgId }),
  );

  await sleep(2 * raiden.config.pollingInterval);
  expect(matrix.sendEvent).toHaveBeenCalledTimes(0);
  expect(raiden.output).not.toContainEqual(
    messageGlobalSend.success(expect.anything(), { roomName: 'unknown_global_room', msgId }),
  );
  expect(raiden.output).toContainEqual(
    messageGlobalSend.failure(
      expect.objectContaining({ message: expect.stringContaining('unknown global room') }),
      { roomName: 'unknown_global_room', msgId },
    ),
  );

  raiden.output.splice(0, raiden.output.length);
  matrix.sendEvent.mockClear();

  const discoveryRoom = raiden.config.discoveryRoom!;

  raiden.store.dispatch(
    messageGlobalSend.request({ message }, { roomName: discoveryRoom, msgId }),
  );

  await sleep(2 * raiden.config.pollingInterval);
  expect(matrix.sendEvent).toHaveBeenCalledTimes(1);
  expect(matrix.sendEvent).toHaveBeenCalledWith(
    expect.any(String),
    'm.room.message',
    expect.objectContaining({ body: text, msgtype: 'm.text' }),
    expect.anything(),
  );
  expect(raiden.output).toContainEqual(
    messageGlobalSend.success(
      { via: expect.stringMatching(/!.*:/), tookMs: expect.any(Number), retries: 0 },
      { roomName: discoveryRoom, msgId },
    ),
  );

  // test graceful failure
  raiden.output.splice(0, raiden.output.length);
  matrix.sendEvent.mockClear();
  matrix.sendEvent.mockRejectedValueOnce(Object.assign(new Error('Failed'), { httpStatus: 429 }));

  raiden.store.dispatch(
    messageGlobalSend.request({ message }, { roomName: discoveryRoom, msgId }),
  );

  await sleep(raiden.config.httpTimeout);
  expect(matrix.sendEvent).toHaveBeenCalledTimes(2);
  expect(matrix.sendEvent).toHaveBeenCalledWith(
    expect.any(String),
    'm.room.message',
    expect.objectContaining({ body: text, msgtype: 'm.text' }),
    expect.anything(),
  );
  expect(raiden.output).toContainEqual(
    messageGlobalSend.success(
      { via: expect.stringMatching(/!.*:/), tookMs: expect.any(Number), retries: 1 },
      { roomName: discoveryRoom, msgId },
    ),
  );
});

describe('rtcConnectEpic', () => {
  let raiden: MockedRaiden, partner: MockedRaiden;
  let RTCPeerConnection: ReturnType<typeof mockRTC>;

  beforeEach(async () => {
    // ensure clients are sorted by address
    [raiden, partner] = getSortedClients(await makeRaidens(2));

    RTCPeerConnection = mockRTC();
    raiden.store.dispatch(
      raidenConfigUpdate({
        caps: {
          [Capabilities.WEBRTC]: 1,
          [Capabilities.TO_DEVICE]: 0,
        },
      }),
    );
    partner.store.dispatch(
      raidenConfigUpdate({
        caps: {
          [Capabilities.WEBRTC]: 1,
          [Capabilities.TO_DEVICE]: 0,
        },
      }),
    );
  });

  afterEach(() => {
    RTCPeerConnection.mockRestore();
    jest.restoreAllMocks();
  });

  test('skip if no webrtc capability exists', async () => {
    raiden.store.dispatch(
      raidenConfigUpdate({ caps: { [Capabilities.WEBRTC]: 0, [Capabilities.TO_DEVICE]: 1 } }),
    );
    await ensureChannelIsOpen([raiden, partner]);
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).not.toContainEqual(rtcChannel(expect.anything(), expect.anything()));
  });

  test('success: receive message & channel error', async () => {
    expect.assertions(7);
    // since we want to test callee's perspective, we need to swap them
    [raiden, partner] = [partner, raiden];
    const partnerId = (await partner.deps.matrix$.toPromise()).getUserId()!;

    const promise = raiden.deps.latest$
      .pipe(pluck('rtc', partner.address), first(isntNil))
      .toPromise();
    await ensureChannelIsOpen([raiden, partner]);

    const channel = (await promise) as MockedDataChannel;
    expect(channel).toMatchObject({ readyState: 'open' });
    expect(raiden.output).toContainEqual(
      rtcChannel(expect.objectContaining({ readyState: 'open' }), { address: partner.address }),
    );
    expect(raiden.output).toContainEqual(
      messageSend.request(
        {
          msgtype: 'm.notice',
          message: expect.stringMatching(/"type":\s*"answer"/),
        },
        { address: partner.address, msgId: expect.any(String) },
      ),
    );

    channel.emit('message', { data: 'hello\nworld' });
    await sleep();
    expect(raiden.output).toContainEqual(
      messageReceived(
        { text: 'hello', message: undefined, ts: expect.any(Number), userId: partnerId },
        { address: partner.address },
      ),
    );
    expect(raiden.output).toContainEqual(
      messageReceived(
        { text: 'world', message: undefined, ts: expect.any(Number), userId: partnerId },
        { address: partner.address },
      ),
    );

    channel.emit('error', { error: new Error('errored') });
    // right after erroring, channel must be cleared
    await expect(
      raiden.deps.latest$.pipe(first(), pluck('rtc', partner.address)).toPromise(),
    ).resolves.toBeUndefined();

    // erroring node should send a 'hangup' to partner
    expect(raiden.output).toContainEqual(
      messageSend.request(
        { msgtype: 'm.notice', message: expect.stringMatching(/"type":\s*"hangup"/) },
        { address: partner.address, msgId: expect.any(String) },
      ),
    );
  });
});
