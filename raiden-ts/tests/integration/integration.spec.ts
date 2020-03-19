import { RaidenState } from 'raiden-ts/state';
import { assert, Storage } from 'raiden-ts/utils/types';
import { Raiden } from 'raiden-ts/raiden';
import fs from 'fs';
import { ContractsInfo } from 'raiden-ts/types';
import { bigNumberify } from 'ethers/utils';

async function createRaiden(
  account: number | string,
  stateOrStorage?: RaidenState | Storage,
  subkey?: true,
): Promise<Raiden> {
  const deploymentInfoFile = process.env.DEPLOYMENT_INFO;
  const deploymentServiceInfoFile = process.env.DEPLOYMENT_SERVICES_INFO;

  assert(deploymentInfoFile !== undefined);
  assert(deploymentServiceInfoFile !== undefined);
  assert(fs.existsSync(deploymentInfoFile));
  assert(fs.existsSync(deploymentServiceInfoFile));

  const options = { encoding: 'utf8', flag: 'r' };

  const deployFile = await fs.readFileSync(deploymentInfoFile, options);
  const servicesDeployFile = await fs.readFileSync(deploymentServiceInfoFile, options);

  const deploy = JSON.parse(deployFile);
  const servicesDeploy = JSON.parse(servicesDeployFile);

  const contractsInfo = ({
    ...deploy.contracts,
    ...servicesDeploy.contracts,
  } as unknown) as ContractsInfo;

  return await Raiden.create(
    'http://localhost:8545',
    account,
    stateOrStorage,
    contractsInfo,
    {
      pfs: 'http://localhost:6000',
      matrixServer: 'http://localhost',
    },
    subkey,
  );
}

const account = '0x0123456789012345678901234567890123456789012345678901234567890123';

describe('integration', () => {
  let raiden: Raiden;
  beforeAll(async () => {
    raiden = await createRaiden(account);
  });

  test('account is funded', async () => {
    const balance = await raiden.getBalance(raiden.address);
    expect(balance.eq(bigNumberify('100000000000000000000000'))).toBe(true);
  });
});
