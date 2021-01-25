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
 * @param message - data of the message event to send
 * @param payload - additional payload to send with message (optional)
 */
export async function sendMessageToClients(message, payload) {
  const clients = await this.clients.matchAll();
  clients.forEach((client) => client.postMessage(message, payload));
}
