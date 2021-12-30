/**
 * Checks if the service worker is controlling any client.
 *
 * Requires to be bound to the service worker context!
 *
 * @returns boolean if there is a connected client
 */
export async function isAnyClientAvailable() {
  const clients = await this.clients.matchAll();
  return clients.length > 0;
}

/**
 * Send a given message to all clients the service worker controls.
 *
 * If the parameter is set, it will send the same message twice to each client.
 * Once in the "new" format and once in the old. A client that only knows the
 * "old" format will ignore the new message format and acts on the old ones. All
 * clients which support the new format are required to ignore the messages with
 * the old format and only act on the new ones.
 * This toggle is there to only do this when necessary. This means any new
 * message type that got added after this breaking change must not be send in
 * the old format as old clients don't handle this message anyway.
 *
 * Requires to be bound to the service worker context!
 *
 * @param message - message send (must support encoding)
 * @param sendOldFormatToo - if to send message in both formats (default: `false`)
 */
export async function sendMessageToClients(message, sendOldFormatToo = false) {
  const clients = await this.clients.matchAll();
  clients.forEach((client) => client.postMessage(message.encode()));

  if (sendOldFormatToo) {
    clients.forEach((client) => client.postMessage(message.encodeOldFormat()));
  }
}
