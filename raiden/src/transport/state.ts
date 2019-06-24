import * as t from 'io-ts';

export const RaidenMatrixSetup = t.type({
  userId: t.string,
  accessToken: t.string,
  deviceId: t.string,
  displayName: t.string,
});

export type RaidenMatrixSetup = t.TypeOf<typeof RaidenMatrixSetup>;
