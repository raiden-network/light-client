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
 * Requires to be bound to the service worker context!
 *
 * @param messageIdentifier - used to match and identify messages by the receiver
 * @param payload - additional payload to send in the message (optional)
 */
export async function sendMessageToClients(messageIdentifier, payload) {
  const clients = await this.clients.matchAll();
  const message = { messageIdentifier, ...payload };
  clients.forEach((client) => client.postMessage(message));
}
