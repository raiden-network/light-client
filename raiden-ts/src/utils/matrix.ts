import { MatrixClient } from 'matrix-js-sdk';
import { encodeUri } from 'matrix-js-sdk/lib/utils';

/**
 * Return server name without schema or path
 *
 * @param server - any URL
 * @returns server URL with domain and port (if present), without schema, paths or query params
 */
export function getServerName(server: string): string | null {
  const match = /^(?:\w*:?\/\/)?([^/#?&]+)/.exec(server);
  return match && match[1];
}

/**
 * MatrixClient doesn't expose this API, but it does exist, so we create it here
 *
 * @param matrix - an already setup and started MatrixClient
 * @param userId - to fetch status/presence from
 * @returns Promise to object containing status data
 */
export function getUserPresence(
  matrix: MatrixClient,
  userId: string,
): Promise<{
  presence: string;
  last_active_ago?: number;
  status_msg?: string;
  currently_active?: boolean;
}> {
  const path = encodeUri('/presence/$userId/status', { $userId: userId });
  return matrix._http.authedRequest(undefined, 'GET', path);
}
