/* eslint-disable @typescript-eslint/no-explicit-any */
import { Storage } from 'raiden-ts/utils/types';

export interface RequestOpts {
  uri: string;
  method: string;
  withCredentials?: boolean;
  qs?: any;
  qsStringifyOptions?: any;
  useQuerystring?: boolean;
  body?: any;
  json?: boolean;
  timeout?: number;
  headers?: any;
}
export type RequestCallback = (err?: Error, response?: any, body?: any) => void;

export const MockStorage: jest.Mock<jest.Mocked<Storage>, [{ [key: string]: string }?]> = jest.fn(
  function (init?: { [key: string]: string }) {
    const storage: NonNullable<typeof init> = init || {};
    return {
      storage,
      getItem: jest.fn(async (key: string) => storage[key] || null),
      setItem: jest.fn(async (key: string, value: string) => {
        storage[key] = value;
      }),
      removeItem: jest.fn(async (key: string) => {
        delete storage[key];
      }),
    };
  },
);

export class MockMatrixRequestFn {
  public constructor(server: string) {
    this.endpoints['/login'] = ({}, callback) =>
      this.respond(callback, 403, { errcode: 'M_FORBIDDEN', error: 'Invalid password' });
    this.endpoints['/register'] = (opts, callback) => {
      let body = opts.body;
      if (typeof body === 'string') body = JSON.parse(body);
      const username = body.username;
      return this.respond(callback, 200, {
        user_id: `@${username}:${server}`,
        access_token: `${username}_access_token`,
        device_id: `${username}_device_id`,
      });
    };
    let i = 0;
    this.endpoints['/sync'] = ({}, callback) =>
      this.respond(callback, 200, { next_batch: `batch_${i++}`, rooms: {}, presence: {} }, 3e3);
    this.endpoints['/pushrules'] = ({}, callback) => this.respond(callback, 200, {});
    this.endpoints['/filter'] = ({}, callback) =>
      this.respond(callback, 200, { filter_id: 'a filter id' });

    const displayNames: { [userId: string]: string } = {};
    const avatarUrls: { [userId: string]: string } = {};
    this.endpoints['/profile'] = (opts, callback) => {
      const match = /\/profile\/([^/]+)/i.exec(opts.uri),
        userId = match && match[1] && decodeURIComponent(match[1]);
      if (opts.method === 'PUT') {
        const body = JSON.parse(opts.body),
          displayName = body['displayname'],
          avatarUrl = body['avatar_url'];
        if (!userId) return this.respond(callback, 400, {});
        if (displayName) displayNames[userId] = displayName;
        if (avatarUrl) avatarUrls[userId] = avatarUrl;
        return this.respond(callback, 200, {});
      } else {
        if (userId && userId in displayNames)
          return this.respond(callback, 200, {
            displayname: displayNames[userId],
            avatar_url: avatarUrls[userId],
          });
        return this.respond(callback, 404, {});
      }
    };
    this.endpoints['/search'] = (opts, callback) => {
      const term = JSON.parse(opts.body)['search_term'];
      return this.respond(callback, 200, {
        results: Object.entries(displayNames)
          .filter(([userId]) => userId.includes(term))
          .map(([user_id, display_name]) => ({ user_id, display_name })),
      });
    };
    this.endpoints['/status'] = (opts, callback) => {
      if (opts.method !== 'GET') return this.respond(callback, 200, {});
      const match = /\/presence\/([^/]+)/i.exec(opts.uri),
        userId = match && match[1] && decodeURIComponent(match[1]);
      if (userId && userId in displayNames)
        return this.respond(callback, 200, {
          presence: 'online',
          last_active_ago: 123,
          currently_active: true,
        });
      return this.respond(callback, 404, {});
    };

    this.endpoints['/join'] = ({}, callback) =>
      this.respond(callback, 200, { room_id: `!${Math.random()}:${server}` });
    this.endpoints['/createRoom'] = ({}, callback) =>
      this.respond(callback, 200, { room_id: `!${Math.random()}:${server}` });
    this.endpoints['/versions'] = ({}, callback) => this.respond(callback, 200, {});
    this.endpoints['/send/m.room.message'] = ({}, callback) =>
      this.respond(callback, 200, { event_id: `$eventId_${Date.now()}` });
  }

  public requestFn(opts: RequestOpts, callback: RequestCallback): any {
    if (this.stopped) {
      callback(new Error('stopped!'));
      return;
    }
    for (const part in this.endpoints) {
      if (opts.uri.includes(part)) {
        const cancel = this.endpoints[part](opts, callback);
        if (cancel) return { abort: cancel };
        else return;
      }
    }
    callback(new Error(`Endpoint not found! ${opts.method} ${opts.uri}`));
  }

  public respond(
    callback: RequestCallback,
    code: number,
    data: any,
    timeout?: number,
  ): () => void {
    let body: string, type: string;
    if (typeof data === 'string') {
      body = data;
      type = 'plain/text';
    } else {
      body = JSON.stringify(data);
      type = 'application/json';
    }

    if (!timeout) {
      callback(undefined, { statusCode: code, headers: { 'content-type': type } }, body);
      return () => undefined;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined = undefined;
    const cancel = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      callback(new Error('cancelled!'));
    };
    timeoutId = setTimeout(() => {
      callback(undefined, { statusCode: code, headers: { 'content-type': type } }, body);
      const idx = this.cancelations.indexOf(cancel);
      if (idx >= 0) this.cancelations.splice(idx, 1);
    }, timeout || 0);
    this.cancelations.push(cancel);
    return cancel;
  }

  public stop(): void {
    this.stopped = true;
    for (const cancel of this.cancelations) {
      cancel();
    }
  }

  private cancelations: (() => void)[] = [];
  private stopped = false;
  public endpoints: {
    [path: string]: (opts: RequestOpts, callback: RequestCallback) => () => void;
  } = {};
}
