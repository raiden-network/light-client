/*
 * The naming of the message enumerations follows **who** is sending the
 * message. Also is it required to assign actual values to the messages to make
 * it work correctly within the service worker.
 */

export enum ServiceWorkerMessages {
  RELOAD_WINDOW = 'reload_window',
}

export enum ServiceWorkerAssistantMessages {
  UPDATE = 'update',
}
