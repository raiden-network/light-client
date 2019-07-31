import * as t from 'io-ts';

export const RaidenMatrixSetup = t.readonly(
  t.type({
    userId: t.string,
    accessToken: t.string,
    deviceId: t.string,
    displayName: t.string,
  }),
);

export interface RaidenMatrixSetup extends t.TypeOf<typeof RaidenMatrixSetup> {}
