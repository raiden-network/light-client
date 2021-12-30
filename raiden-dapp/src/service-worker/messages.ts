import type ServiceWorkerAssistant from './assistant';

export enum ServiceWorkerMessageType {
  INSTALLED_VERSION = 'installed_version',
  INSTALLATION_ERROR = 'installation_error',
  RELOAD_WINDOW = 'reload_window',
  CACHE_IS_INVALID = 'cache_is_invalid',
  UPDATE = 'update',
  VERIFY_CACHE = 'verify_cache',
  UNKNOWN = 'unknown', // Used for messages which could not be parsed.
}

export type ServiceWorkerMessagePayload = Record<string, unknown>;

export type ServiceWorkerMessageHandler = (
  this: ServiceWorkerAssistant,
  payload: ServiceWorkerMessagePayload,
) => void;

export abstract class ServiceWorkerMessage {
  abstract readonly type: ServiceWorkerMessageType;
  abstract readonly payload: ServiceWorkerMessagePayload;

  public encode(): Record<string, unknown> {
    return {
      type: this.type,
      ...this.payload,
    };
  }

  public encodeOldFormat(): string {
    return this.type;
  }
}

export class ServiceWorkerMessageSimple extends ServiceWorkerMessage {
  constructor(
    public readonly type: ServiceWorkerMessageType,
    public readonly payload: ServiceWorkerMessagePayload = {},
  ) {
    super();
  }
}

export class ServiceWorkerMessageEvent extends ServiceWorkerMessage {
  constructor(private event: MessageEvent) {
    super();
  }

  get isInOldFormat(): boolean {
    return this.event.data && typeof this.event.data === 'string';
  }

  get isInNewFormat(): boolean {
    return (
      this.event.data &&
      typeof this.event.data === 'object' &&
      this.event.data.type &&
      typeof this.event.data.type === 'string'
    );
  }

  get isInUnknownFormat(): boolean {
    return !(this.isInOldFormat || this.isInNewFormat);
  }

  get type(): ServiceWorkerMessageType {
    if (this.isInUnknownFormat) {
      return ServiceWorkerMessageType.UNKNOWN;
    }

    const { data } = this.event;
    const rawType = this.isInOldFormat ? data : data.type;
    return this.mapRawTypeToMessageType(rawType);
  }

  get payload(): ServiceWorkerMessagePayload {
    if (this.isInNewFormat) {
      const { _type, ...payload } = this.event.data;
      return payload;
    } else {
      return {};
    }
  }

  private mapRawTypeToMessageType(rawType: string): ServiceWorkerMessageType {
    for (const messageType of Object.values(ServiceWorkerMessageType)) {
      if (rawType == messageType) {
        return messageType;
      }
    }

    return ServiceWorkerMessageType.UNKNOWN;
  }
}
