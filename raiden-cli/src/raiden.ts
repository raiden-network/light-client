import { Raiden, RaidenChannel, RaidenChannels, ChannelState } from 'raiden-ts';
import { LocalStorage } from 'node-localstorage';
import { flatMap, values, filter } from 'lodash';
import { Subscription } from 'rxjs';

const DEFAULT_CONFIG = {
  matrixServer: 'https://raidentransport.test001.env.raiden.network',
  pfs: 'https://pfs.raidentransport.test001.env.raiden.network',
  pfsSafetyMargin: 1.1,
  caps: { noDelivery: true, webRTC: true },
};

export default class RaidenService {
  private static _instance: RaidenService;
  private static _status = 'unavailable';
  private _raiden: Raiden;
  private _channels: RaidenChannels;
  private _subscriptions: Subscription[];

  constructor(raiden: Raiden) {
    this._raiden = raiden;
    this._channels = {};
    this._subscriptions = [];
  }

  static getInstance(): RaidenService {
    if (this._instance === undefined) {
      throw new Error('The Raiden service has not been connected yet!');
    } else {
      return this._instance;
    }
  }
  static async connect(
    ethNode: string,
    privateKey: string,
    storage: LocalStorage,
    userConfig: object, // TODO: this should be PartialRaidenConfig, but is not available by SDK
  ): Promise<RaidenService> {
    RaidenService._status = 'syncing';
    const raiden = await Raiden.create(ethNode, privateKey, storage, undefined, {
      ...DEFAULT_CONFIG,
      ...userConfig,
    });
    const service = new RaidenService(raiden);
    service.start();
    service.subscribeToChannelUpdates();
    service.subscribeToEmittedEvents();
    this._instance = service;
    return service;
  }

  static get status(): string {
    return RaidenService._status;
  }

  static get version(): string {
    return Raiden.version;
  }

  get unlockedAddress(): string {
    return this._raiden.address;
  }

  get allChannels(): RaidenChannel[] {
    // To resolve structure {token: {partner: [channel..], partner:...}, token...}
    return flatMap(values(this._channels), (partnerChannels) => values(partnerChannels));
  }

  start(): void {
    this._raiden.start();
    RaidenService._status = 'ready'; // TODO: Are we actually ready here?
  }

  stop(): void {
    this._subscriptions.forEach((subscription) => subscription.unsubscribe());
    this._subscriptions = [];
    this._raiden.stop();
    RaidenService._status = 'unavailable;';
  }

  filterChannels(
    state?: ChannelState,
    tokenAddress?: string,
    partnerAddress?: string,
  ): RaidenChannel[] {
    let filteredChannels = this.allChannels;

    if (state) {
      filteredChannels = filter(filteredChannels, (channel) => channel.state === state);
    }
    if (tokenAddress) {
      filteredChannels = filter(filteredChannels, (channel) => channel.token === tokenAddress);
    }
    if (partnerAddress) {
      filteredChannels = filter(filteredChannels, (channel) => channel.partner === partnerAddress);
    }

    return filteredChannels;
  }

  async openChannel(
    tokenAddress: string,
    partnerAddress: string,
    deposit: number,
    settleTimeout: number,
  ): Promise<void> {
    await this._raiden.openChannel(tokenAddress, partnerAddress, { deposit, settleTimeout });
  }

  async closeChannel(tokenAddress: string, partnerAddress: string): Promise<void> {
    await this._raiden.closeChannel(tokenAddress, partnerAddress);
  }

  private subscribeToChannelUpdates(): void {
    const subscription = this._raiden.channels$.subscribe((value) => (this._channels = value));
    this._subscriptions.push(subscription);
  }

  private subscribeToEmittedEvents(): void {
    const subscription = this._raiden.events$.subscribe(
      undefined,
      () => this.stop(),
      () => this.stop(),
    );
    this._subscriptions.push(subscription);
  }
}
