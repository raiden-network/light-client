/* eslint-disable @typescript-eslint/no-explicit-any,@typescript-eslint/camelcase,@typescript-eslint/no-empty-interface,@typescript-eslint/interface-name-prefix */
// Type definitions for matrix-js-sdk
// Project: matrix-js-sdk
// Adapted from definitions by: Will Hunt <will@half-shot.uk>

declare module 'matrix-js-sdk' {
  import { EventEmitter } from 'events';

  // export declare class Matrix {
  //   //class IndexedDBStoreBackend {
  // }

  export class SyncAccumulator {
    public constructor(opts: SyncAccumulatorOpts);
    public getJSON(): any;
  }

  export class MatrixHttpApi {}

  export class MatrixError {
    public errcode: string;
    public name: string;
    public message: string;
    public data: any;
    public httpStatus: number;
    public constructor(errorJson: any);
  }

  export interface UserProfile {
    displayname?: string;
    avatar_url?: string;
  }

  export interface User {
    userId: string;
    displayName?: string;
    avatarUrl?: string;
    presence?: string;
    presenceStatusMsg?: string;
    lastActiveAgo?: number;
    lastPresenceTs?: number;
    currentlyActive?: boolean;
  }

  export interface EventContext {
    start: string;
    end: string;

    profile_info: Map<string, UserProfile>;

    events_after: Event[];
    events_before: Event[];
  }

  export interface EventWithContext {
    event: MatrixEvent;
    context?: {
      start: string;
      end: string;

      state: MatrixEvent[];
      events_after: MatrixEvent[];
      events_before: MatrixEvent[];
    };
  }

  export enum PendingEventOrder {
    chronological = 'chronological',
    detached = 'detached',
  }

  export interface StartClientOpts {
    initialSyncLimit?: number; // default: 8
    includeArchivedRooms?: boolean; // default: false
    resolveInvitesToProfiles?: boolean; // default: false
    pendingEventOrdering?: PendingEventOrder; // default: chronological
    pollTimeout?: number; // default: 30000
    filter?: Filter; // default: None
    disablePresence?: boolean; // default: false
  }

  export class MatrixClient extends EventEmitter {
    public constructor(opts: MatrixClientOpts);

    public _http: any;

    public deviceId: string | null;
    public credentials: { userId: string | null };

    private _requestTokenFromEndpoint(endpoint: string, params: object): Promise<string>;

    public startClient(opts: StartClientOpts | number): Promise<any>; // backwards compat with historyLen
    public stopClient(): void;

    // base-apis interface
    public loginWithPassword(
      user: string,
      password: string,
      callback?: requestCallback,
    ): Promise<{ user_id: string; access_token: string; device_id: string }>;

    public register(
      user: string,
      password: string,
      sessionId?: string,
      auth?: any,
      bindThreepids?: { email?: string; msisdn?: string },
      guestAccessToken?: string,
      callback?: requestCallback,
    ): Promise<{ user_id: string; access_token: string; device_id: string }>;

    public joinRoom(
      roomIdOrAlias: string,
      opts?: { syncRoom?: boolean; inviteSignUrl?: string; viaServers?: string[] },
      callback?: requestCallback,
    ): Promise<Room>;
    public leave(roomId: string, callback?: requestCallback): Promise<{}>;

    public setDisplayName(name: string, callback?: requestCallback): Promise<any>;

    public searchUserDirectory(opts: {
      term: string;
      limit?: number;
    }): Promise<{
      limited: boolean;
      results: { user_id: string; display_name?: string; avatar_url?: string }[];
    }>;

    public getUserId(): string | null;
    public getUser(userId: string): User | null;
    public getUsers(): User[];
    public sendEvent(
      roomId: string,
      eventType: string,
      content: any,
      txnId: string,
      callback?: requestCallback,
    ): Promise<{ event_id: string }>;
    public invite(roomId: string, userId: string, callback?: requestCallback): Promise<{}>;

    public acceptGroupInvite(groupId: string, opts: object): Promise<object> | MatrixError;
    public addPushRule(
      scope: string,
      kind: string,
      ruleId: string,
      body: object,
      callback?: requestCallback,
    ): Promise<any> | MatrixError | void;
    public addRoomToGroup(
      groupId: string,
      roomId: string,
      isPublic: boolean,
    ): Promise<object> | MatrixError;
    public addRoomToGroupSummary(
      groupId: string,
      roomId: string,
      categoryId?: string,
    ): Promise<object> | MatrixError;
    public addThreePid(
      creds: object,
      bind: boolean,
      callback?: requestCallback,
    ): Promise<any> | MatrixError | void;
    public addUserToGroupSummary(
      groupId: string,
      userId: string,
      roleId?: string,
    ): Promise<object> | MatrixError;
    public backPaginateRoomEventsSearch(searchResults: object): Promise<object> | MatrixError;
    public ban(
      roomId: string,
      userId: string,
      reason?: string,
      callback?: requestCallback,
    ): Promise<any> | MatrixError | void;
    public cancelAndResendEventRoomKeyRequest(event: MatrixEvent): void;
    public cancelPendingEvent(event: MatrixEvent): void; // throws error if the event is not in QUEUED or NOT_SENT state.
    public cancelUpload(promise: Promise<any>): boolean;
    public claimOneTimeKeys(
      devices: string[],
      keyAlgorithm?: string,
    ): Promise<object> | MatrixError;
    public clearStores(): Promise<void>;
    public createAlias(
      alias: string,
      roomId: string,
      callback?: requestCallback,
    ): Promise<any> | MatrixError | void;
    public createFilter(content: object): Promise<object> | MatrixError;
    public createGroup(content: {
      localpart: string;
      profile: object;
    }): Promise<{ group_id: string }> | MatrixError;
    public createRoom(
      options: {
        room_alias_name?: string;
        visibility?: string;
        invite?: string[];
        name?: string;
        topic?: string;
      },
      callback?: requestCallback,
    ): Promise<{ room_id: string; room_alias?: string }>;
    public deactivateAccount(auth?: object, callback?: requestCallback): Promise<object>;
    public deleteAlias(
      alias: string,
      callback?: requestCallback,
    ): Promise<any> | MatrixError | void;
    public deleteDevice(deviceId: string, auth?: object): Promise<object> | MatrixError;
    public deleteMultipleDevices(devices: string[], auth?: object): Promise<object> | MatrixError;
    public deletePushRule(
      scope: string,
      kind: string,
      ruleId: string,
      callback?: requestCallback,
    ): Promise<any> | MatrixError | void;
    public deleteRoomTag(
      roomId: string,
      tagName: string,
      callback?: requestCallback,
    ): Promise<any> | MatrixError | void;
    public deleteThreePid(medium: string, address: string): Promise<object> | MatrixError;
    public downloadKeys(userIds: string[], forceDownload: boolean): Promise<object> | MatrixError;
    public downloadKeysForUsers(userIds: string[], opts?: object): Promise<object> | MatrixError;
    public dropFromPresenceList(
      callback?: requestCallback,
      userIds?: string[],
    ): Promise<any> | MatrixError | void; // TODO
    public exportRoomKeys(): Promise<any>;
    public forget(
      roomId: string,
      deleteRoom: boolean,
      callback?: requestCallback,
    ): Promise<any> | MatrixError | void;
    public generateClientSecret(): string;
    public getAccessToken(): string | null;
    public getAccountData(eventType: string): object | null;
    public getCanResetTimelineCallback(): any | null;
    public getCasLoginUrl(redirectUrl: string): string;
    public getCurrentUploads(): { promise: Promise<any>; loaded: number; total: number }[];
    public getDeviceEd25519Key(): string | null;
    public getDeviceId(): string | null;
    public getDevices(): Promise<object> | MatrixError;
    public getDomain(): string | null;
    public getEventMapper(): any;
    public getEventSenderDeviceInfo(event: MatrixEvent): Promise<object> | MatrixError;
    public getEventTimeline(timelineSet: any, eventId: string): Promise<EventTimelineSet>;
    public getFallbackAuthUrl(loginType: string, authSessionId: string): string;
    public getFilter(
      userId: string,
      filterId: string,
      allowCached?: boolean,
    ): Promise<any> | MatrixError;
    public getGlobalBlacklistUnverifiedDevices(): boolean;
    public getGroup(groupId: string): Group | null;
    public getGroupInvitedUsers(groupId: string): Promise<object> | MatrixError;
    public getGroupProfile(groupId: string): Promise<object> | MatrixError;
    public getGroupRooms(groupId: string): Promise<object> | MatrixError;
    public getGroups(): Group[];
    public getGroupSummary(groupId: string): Promise<object> | MatrixError;
    public getGroupUsers(groupId: string): Promise<object> | MatrixError;
    public getHomeserverUrl(): string;
    public getIdentityServerUrl(stripProto?: boolean): string;
    public getIgnoredUsers(): string[];
    public getJoinedGroups(): Promise<any> | MatrixError;
    public getKeyChanges(oldToken: string, newToken: string): Promise<object> | MatrixError;
    public getNotifTimelineSet(): EventTimelineSet | null;
    public getOpenIdToken(): Promise<object> | MatrixError;
    public getOrCreateFilter(filterName: string, filter: Filter): Promise<string> | MatrixError;
    public getPresenceList(callback?: requestCallback): Promise<any> | MatrixError | void;
    public getProfileInfo(
      userId: string,
      info: string,
      callback?: requestCallback,
    ): Promise<UserProfile>;
    public getPublicisedGroups(userIds: string[]): Promise<object> | MatrixError;
    public getPushActionsForEvent(event: MatrixEvent): object;
    public getPushers(callback?: requestCallback): Promise<object[]> | MatrixError | void;
    public getPushRules(callback?: requestCallback): Promise<any> | MatrixError | void;
    public getRoom(roomId: string): Room | null;
    public getRoomDirectoryVisibility(
      roomId: string,
      callback?: requestCallback,
    ): Promise<any> | MatrixError | void;
    public getRoomIdForAlias(
      alias: string,
      callback?: requestCallback,
    ): Promise<object> | MatrixError | void;
    public getRoomPushRule(scope: string, roomId: string): object | undefined;
    public getRooms(): Room[];
  }
  /*
  export class MatrixScheduler implements IMatrixScheduler {
      getQueueForEvent(Event: Models.MatrixEvent): Models.MatrixEvent[]|null;
      queueEvent(Event: Models.MatrixEvent): Promise<void>;
      removeEventFromQueue(Event: Models.MatrixEvent): boolean;
      setProcessFunction(fn: MatrixSchedulerProcessFunction): void;
  }
  */
  export class ContentRepo {}

  export class FilterComponent {
    public constructor(filter_json: object);

    private _checkFields(
      room_id: string,
      sender: string,
      event_type: string,
      contains_url: string,
    ): boolean;
    public check(event: MatrixEvent): boolean;
    public filter(events: MatrixEvent[]): MatrixEvent[];
    public limit(): number;
  }

  export enum EventFormat {
    client = 'client',
    federation = 'federation',
  }

  export interface FilterJson {
    limit?: number;
    not_senders?: string[];
    not_types?: string[];
    senders?: string[];
    types?: string[];
  }

  export interface RoomEventFilterJson {
    limit?: number;
    not_senders?: string[];
    not_types?: string[];
    not_rooms?: string[];
    senders?: string[];
    types?: string[];
    rooms?: string[];
    contains_url?: boolean; // default: undefined
  }

  export interface RoomFilterJson {
    not_rooms?: string[];
    rooms?: string[];
    ephemeral?: RoomEventFilterJson;
    include_leave?: boolean; // default: false
    state?: RoomEventFilterJson;
    timeline?: RoomEventFilterJson;
    account_data?: RoomEventFilterJson;
  }

  export interface FilterDefinition {
    event_fields?: string[]; // default: *all*
    event_format?: EventFormat; // default: client
    presence?: FilterJson; // default: *all*
    account_data?: FilterJson; // default: *all*
    room?: RoomFilterJson; // default: *all*
  }

  export class Filter {
    public userId: string;
    public filterId?: string;

    public constructor(userId: string, filterId?: string);
    public static fromJson(userId: string, filterId: string, jsonObj: object): Filter;

    public filterRoomTimeline(events: MatrixEvent[]): MatrixEvent[];
    public getDefinition(): object;
    public getFilterId(): string | undefined;
    public getRoomTimelineFilterComponent(): FilterComponent;
    public setDefinition(definition: FilterDefinition): void;
    public setIncludeLeaveRooms(includeLeave: boolean): void;
    public setTimelineLimit(limit: number): void;
  }

  export class TimelineWindow {}

  export class InteractiveAuth {}

  export interface RoomSummaryInfo {
    title: string;
    desc: string;
    numMembers: number;
    aliases: string[];
    timestamp: number;
  }

  export interface MatrixClientOpts {
    baseUrl?: string;
    idBaseUrl?: string;
    request?: requestFunction;
    accessToken?: string;
    userId?: string;
    store?: IMatrixStore;
    deviceId?: string;
    sessionStore?: ICryptoStore;
    scheduler?: IMatrixScheduler;
    queryParams?: any;
    localTimeoutMs?: number;
    useAuthorizationHeader?: boolean;
    timelineSupport?: boolean;
    cryptoStore?: ICryptoStore;
  }

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

  export type requestCallback = (err?: Error, response?: any, body?: any) => void;
  export type requestFunction = (opts: RequestOpts, callback: requestCallback) => void;
  //export type MatrixSchedulerProcessFunction = (Event: Models.MatrixEvent)=> Promise<void>;

  export interface SyncAccumulatorOpts {
    maxTimelineEntries: number;
  }

  export interface ICryptoStore {}

  export interface IMatrixStore {
    deleteAllData(): Promise<void>;
    getAccountData(eventType: string): void;
    getFilter(userId: string, filterId: string): void;
    getFilterIdByName(filterName: string): void;
    //getGroup(): Models.Group;
    //getGroups(): Models.Group[];
    //getRoom(roomId: string): Models.Room;
    //getRooms(): Models.Room[];
    getRoomSummaries(): RoomSummary[];
    getSavedSync(): Promise<any>;
    getSyncToken(): string;
    //getUser(userId: string): Models.User;
    //getUsers(): Models.User[];
    removeRoom(roomId: string): void;
    save(): void;
    //scrollback(room: Models.Room, limit: number): any[];
    setFilterIdByName(filterName: string, filterId: string): void;
    setSyncData(syncData: any): Promise<void>;
    setSyncToken(token: string): void;
    startup(): Promise<void>;
    //storeAccountDataEvents(events: Models.MatrixEvent[]): void;
    //storeEvents(room: Models.Room, events: Models.MatrixEvent[], token: string, toStart: boolean): void;
    storeFilter(filter: Filter): void;
    //storeGroup(group: Models.Group): void;
    //storeRoom(room: Models.Room): void;
    //storeUser(user: Models.User): void;
  }

  // Classes

  // models/room-summary.js
  export class RoomSummary {
    public constructor(roomId: string, info: RoomSummaryInfo);
    public roomId: string;
    public info: RoomSummaryInfo;
  }

  // Opts Types

  // Interfaces

  export interface IMatrixScheduler {
    //getQueueForEvent(Event: Models.MatrixEvent): Models.MatrixEvent[]|null;
    //queueEvent(Event: Models.MatrixEvent): Promise<void>;
    //removeEventFromQueue(Event: Models.MatrixEvent): boolean;
    //setProcessFunction(fn: MatrixSchedulerProcessFunction): void;
  }

  // Global Functions

  export function createClient(opts: MatrixClientOpts | string): MatrixClient;

  // Export Models and Stores that are global.
  // }

  /*

  /!*
  Event-context.js
  room-summary.js
  search-result.js
   *!/

  declare namespace Matrix.Models {

      /!* models/Event-timeline.js*!/
      */
  export class EventTimeline {}
  /*

      /!* models/Event-timeline-set*!/
      */
  export class EventTimelineSet {}
  /*

      /!* models/Event.js *!/
      */
  export interface Event {
    sender: string;
    room_id: string;
    event_id: string;
    content: any;
    state_key?: string;
    redacts?: string;
    type: string;
    origin_server_ts?: number;
  }

  interface MapStringString {
    [key: string]: string;
  }

  export class MatrixEvent {
    public event: Event;
    // sender: RoomMember;
    // target: RoomMember;
    // status: EventStatus;
    public error: Error;
    public forwardLooking: boolean;

    private _clearEvent: object;

    public constructor(event: Event);

    // custom
    public getClearEvent(): Event;

    public readonly EventStatus: string;
    private _setClearData(decryptionResult: any);
    public attemptDecryption(crypto: any): Promise<void>;
    public getAge(): number;
    public getClaimedEd25519Key(): string;
    public getContent(): object;
    public getDate(): Date;
    public getDirectionalContent(): object;
    public getForwardingCurve25519KeyChain(): string[];
    public getId(): string;
    public getKeysClaimed(): MapStringString;
    public getPrevContent(): object;
    public getPushActions(): object | null;
    public getRoomId(): string;
    public getSender(): string;
    public getSenderKey(): string;
    public getStateKey(): string | undefined;
    public getTs(): number;
    public getType(): string;
    public getWireContent(): object;
    public getWireType(): string;
    public handleRemoteEcho(event: Event): void;
    public isBeingDecrypted(): boolean;
    public isDecryptionFailure(): boolean;
    public isEncrypted(): boolean;
    public isRedacted(): boolean;
    public isState(): boolean;
    public makeEncrypted(
      cryptoType: string,
      cryptoContent: object,
      senderCurve25519Key: string,
      claimedEd25519Key: string,
    ): void;
    public makeRedacted(redactionEvent: MatrixEvent): void;
    public setPushActions(pushActions: object): void;
  }
  /*

      export class EventStatus {
          NOT_SENT: string;
          ENCRYPTING: string;
          SENDING: string;
          QUEUED: string;
          SENT: string;
          CANCELLED: string;
      }

      /!* models/group.js *!/
      */
  export class Group {
    public groupId: string;
    public name: string;
    public avatarUrl: string;
    public myMembership: string;
    public inviter: any;
    public constructor(groupId: string);
    public setProfile(name: string, avatarUrl: string): void;
    public setMyMembership(membership: string): void;
    public setInviter(inviter: string): void;
  }
  /*

  /!* models/room.js *!/
  */
  export class Room {
    public name: string;
    public roomId: string;
    public getMember(userId: string): RoomMember | null;
    public getJoinedMembers(): RoomMember[];
  }

  /* models/room-member.js*/
  export interface RoomMember {
    roomId: string;
    userId: string;
    name: string;
    membership: string | null;
    user: User | null;
  }

  /* models/room-state.js */
  export interface RoomState {
    roomId: string;
    members: { [userId: string]: RoomMember };
  }
  /*

      /!* models/user.js*!/
      export class User {

      }
  }

  declare namespace Matrix.Crypto {

      export interface CryptoStore {

      }

      export class MemoryCryptoStore implements CryptoStore {

      }

      export class IndexedDBCryptoStore implements CryptoStore {

      }
  }
  declare namespace Matrix.Store {

      export class MatrixInMemoryStore implements IMatrixStore {
          //Incomplete
          deleteAllData(): Promise<void>;
          getAccountData(eventType: string): void;
          getFilter(userId: string, filterId: string): void;
          getFilterIdByName(filterName: string): void;
          getGroup(): Models.Group;
          getGroups(): Models.Group[];
          getRoom(roomId: string): Models.Room;
          getRooms(): Models.Room[];
          getRoomSummaries(): RoomSummary[];
          getSavedSync(): Promise<any>;
          getSyncToken(): string;
          getUser(userId: string): Models.User;
          getUsers(): Models.User[];
          removeRoom(roomId: string): void;
          save(): void;
          scrollback(room: Models.Room, limit: number): any[];
          setFilterIdByName(filterName: string, filterId: string): void;
          setSyncData(syncData: any): Promise<void>;
          setSyncToken(token: string): void;
          startup(): Promise<void>;
          storeAccountDataEvents(events: Models.MatrixEvent[]): void;
          storeEvents(room: Models.Room, events: Models.MatrixEvent[], token: string, toStart: boolean): void;
          storeFilter(filter: Filter): void;
          storeGroup(group: Models.Group): void;
          storeRoom(room: Models.Room): void;
          storeUser(user: Models.User): void;
      }

      export class IndexedDBStore implements IMatrixStore {
          //Incomplete
          deleteAllData(): Promise<void>;
          getAccountData(eventType: string): void;
          getFilter(userId: string, filterId: string): void;
          getFilterIdByName(filterName: string): void;
          getGroup(): Models.Group;
          getGroups(): Models.Group[];
          getRoom(roomId: string): Models.Room;
          getRooms(): Models.Room[];
          getRoomSummaries(): RoomSummary[];
          getSavedSync(): Promise<any>;
          getSyncToken(): string;
          getUser(userId: string): Models.User;
          getUsers(): Models.User[];
          removeRoom(roomId: string): void;
          save(): void;
          scrollback(room: Models.Room, limit: number): any[];
          setFilterIdByName(filterName: string, filterId: string): void;
          setSyncData(syncData: any): Promise<void>;
          setSyncToken(token: string): void;
          startup(): Promise<void>;
          storeAccountDataEvents(events: Models.MatrixEvent[]): void;
          storeEvents(room: Models.Room, events: Models.MatrixEvent[], token: string, toStart: boolean): void;
          storeFilter(filter: Filter): void;
          storeGroup(group: Models.Group): void;
          storeRoom(room: Models.Room): void;
          storeUser(user: Models.User): void;
      }

      export class WebStorageSessionStore implements IMatrixStore {
          //Incomplete
          deleteAllData(): Promise<void>;
          getAccountData(eventType: string): void;
          getFilter(userId: string, filterId: string): void;
          getFilterIdByName(filterName: string): void;
          getGroup(): Models.Group;
          getGroups(): Models.Group[];
          getRoom(roomId: string): Models.Room;
          getRooms(): Models.Room[];
          getRoomSummaries(): RoomSummary[];
          getSavedSync(): Promise<any>;
          getSyncToken(): string;
          getUser(userId: string): Models.User;
          getUsers(): Models.User[];
          removeRoom(roomId: string): void;
          save(): void;
          scrollback(room: Models.Room, limit: number): any[];
          setFilterIdByName(filterName: string, filterId: string): void;
          setSyncData(syncData: any): Promise<void>;
          setSyncToken(token: string): void;
          startup(): Promise<void>;
          storeAccountDataEvents(events: Models.MatrixEvent[]): void;
          storeEvents(room: Models.Room, events: Models.MatrixEvent[], token: string, toStart: boolean): void;
          storeFilter(filter: Filter): void;
          storeGroup(group: Models.Group): void;
          storeRoom(room: Models.Room): void;
          storeUser(user: Models.User): void;
      }

      export class StubStore implements IMatrixStore {
          deleteAllData(): Promise<void>;
          getAccountData(eventType: string): void;
          getFilter(userId: string, filterId: string): void;
          getFilterIdByName(filterName: string): void;
          getGroup(): Models.Group;
          getGroups(): Models.Group[];
          getRoom(roomId: string): Models.Room;
          getRooms(): Models.Room[];
          getRoomSummaries(): RoomSummary[];
          getSavedSync(): Promise<any>;
          getSyncToken(): string;
          getUser(userId: string): Models.User;
          getUsers(): Models.User[];
          removeRoom(roomId: string): void;
          save(): void;
          scrollback(room: Models.Room, limit: number): any[];
          setFilterIdByName(filterName: string, filterId: string): void;
          setSyncData(syncData: any): Promise<void>;
          setSyncToken(token: string): void;
          startup(): Promise<void>;
          storeAccountDataEvents(events: Models.MatrixEvent[]): void;
          storeEvents(room: Models.Room, events: Models.MatrixEvent[], token: string, toStart: boolean): void;
          storeFilter(filter: Filter): void;
          storeGroup(group: Models.Group): void;
          storeRoom(room: Models.Room): void;
          storeUser(user: Models.User): void;
      }

  }

  */

  export function request(r: requestFunction): void;
}

declare module 'matrix-js-sdk/lib/utils' {
  export function encodeUri(pathTemplate: string, variables: { [fragment: string]: any }): string;
}
