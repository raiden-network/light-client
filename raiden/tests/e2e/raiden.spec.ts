import { TestProvider } from './provider';

import { Raiden } from 'raiden/raiden';
import { ContractsInfo, RaidenContracts } from 'raiden/types';

describe('Raiden', () => {
  const provider = new TestProvider();
  let info: ContractsInfo;
  let snapId: number | undefined;
  let raiden: Raiden;
  let token: string, tokenNetwork: string;

  beforeAll(async () => {
    jest.setTimeout(15e3);
    let contracts: RaidenContracts;
    [info, contracts] = await provider.deployRaidenContracts();
    token = Object.keys(contracts.tokens)[0];
    tokenNetwork = Object.keys(contracts.tokenNetworks)[0];
  });

  beforeEach(async () => {
    if (snapId !== undefined) await provider.revert(snapId);
    snapId = await provider.snapshot();
    console.log('snapId', snapId);
    raiden = await Raiden.create(provider, 0, undefined, info);
  });

  afterEach(() => {
    raiden.stop();
  });

  test('monitorToken', async () => {
    await expect(raiden.monitorToken(token)).resolves.toBe(tokenNetwork);
  });
});
