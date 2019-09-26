import fetch from 'cross-fetch';
import { MatrixClient } from 'matrix-js-sdk';
import { encodeUri } from 'matrix-js-sdk/lib/utils';

/**
 * From a yaml list string, return as Array
 * E.g. yamlListToArray(`
 * # comment
 *   - test1
 *   - test2
 *   - test3
 * `) === ['test1', 'test2', 'test3']
 *
 * @param yml - String containing only YAML list
 * @returns List of strings inside yml-encoded text
 */
export function yamlListToArray(yml: string): string[] {
  // match all strings starting with optional spaces followed by a dash + space
  // capturing only the content of the list item, trimming spaces
  const reg = /^\s*-\s*(.+?)\s*$/gm;
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = reg.exec(yml))) {
    results.push(match[1]);
  }
  return results;
}

/**
 * Given a server name (with or without schema and port), return HTTP GET round trip time
 *
 * @param server - Server name with or without schema
 * @returns Promise to a { server, rtt } object, where `rtt` may be NaN
 */
export async function matrixRTT(server: string): Promise<{ server: string; rtt: number }> {
  let url = server;
  if (!url.includes('://')) {
    url = `https://${url}`;
  }
  url += `/_matrix/client/versions`;
  let start = Date.now();
  try {
    const resp = await fetch(url);
    if (resp.status < 200 || resp.status >= 300) throw NaN;
  } catch (e) {
    start = NaN; // return will also be NaN
  }
  return { server, rtt: Date.now() - start };
}

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
