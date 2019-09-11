import * as t from 'io-ts';

/**
 * A Raiden configuration object with required parameters and
 * optional parameters from [[PartialRaidenConfig]].
 *
 * @matrixServerLookup Matrix server URL to fetch existing matrix servers from.
 * After intializing a [[Raiden]] instance, the matrix server can't be changed later on.
 * @revealTimeout Timeout for secrets to be revealed
 * @settleTimeout Timeout for channels to be settled
 */
export const RaidenConfig = t.readonly(
  t.intersection([
    t.type({
      matrixServerLookup: t.string,
      revealTimeout: t.number,
      settleTimeout: t.number,
    }),
    t.partial({
      matrixServer: t.string,
    }),
  ]),
);
export interface RaidenConfig extends t.TypeOf<typeof RaidenConfig> {}

export const defaultConfig: RaidenConfig = {
    matrixServerLookup: 'https://raw.githubusercontent.com/raiden-network/raiden-transport/master/known_servers.test.yaml',
    settleTimeout: 500,
    revealTimeout: 50,
}
