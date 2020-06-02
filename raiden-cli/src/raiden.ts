import { Raiden, Hash } from 'raiden-ts';
import { LocalStorage } from 'node-localstorage';

const DEFAULT_CONFIG = {
  matrixServer: 'https://raidentransport.test001.env.raiden.network',
  pfs: 'https://pfs.raidentransport.test001.env.raiden.network',
  pfsSafetyMargin: 1.1,
  caps: { noDelivery: true, webRTC: true },
};

export default class RaidenService {
  private static _instance: RaidenService;
  private _raiden: Raiden;

  constructor(raiden: Raiden) {
    this._raiden = raiden;
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
    userConfig: object, // TODO: this should be PartialRaidenConfig, but is not available
  ) {
    const raiden = await Raiden.create(ethNode, privateKey, storage, undefined, {
      ...DEFAULT_CONFIG,
      ...userConfig,
    });
    raiden.start();
    this._instance = new RaidenService(raiden);
  }

  stop(): void {
    this._raiden.stop();
  }
}
