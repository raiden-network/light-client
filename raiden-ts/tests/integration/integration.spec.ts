import { RaidenState } from 'raiden-ts/state';
import { assert, Storage } from 'raiden-ts/utils/types';
import { Raiden } from 'raiden-ts/raiden';
import fs from 'fs';
import { ContractsInfo } from 'raiden-ts/types';
import { bigNumberify, parseEther } from 'ethers/utils';
import { MockStorage } from '../e2e/mocks';
import { filter } from 'rxjs/operators';
import { Signer, Wallet } from 'ethers';

jest.setTimeout(80000);

const signer = new Wallet('0x0123456789012345678901234567890123456789012345678901234567890123');
const partner1 = '0x517aAD51D0e9BbeF3c64803F86b3B9136641D9ec';
const partner2 = '0xCBC49ec22c93DB69c78348C90cd03A323267db86';

async function createRaiden(
  account: number | string | Signer,
  stateOrStorage?: RaidenState | Storage,
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

  return await Raiden.create('http://localhost:8545', account, stateOrStorage, contractsInfo, {
    pfs: 'http://localhost:6000',
    matrixServer: 'http://localhost',
    revealTimeout: 10,
    settleTimeout: 50,
    confirmationBlocks: 1,
  });
}

function getToken(): string {
  const token = process.env.TTT_TOKEN_ADDRESS;
  assert(token !== undefined, 'TTT Token address is undefined');
  return token;
}

describe('integration', () => {
  let raiden: Raiden;
  let storage: jest.Mocked<Storage>;

  beforeAll(async () => {
    storage = new MockStorage();
    raiden = await createRaiden(signer, storage);
    raiden.start();
  });

  afterAll((done) => {
    raiden.stop();
    raiden.events$.pipe(filter((value) => value.type === 'raidenShutdown')).subscribe(done);
  });

  test('account is funded', async () => {
    const balance = await raiden.getBalance(raiden.address);
    expect(balance.eq(bigNumberify('100000000000000000000000'))).toBe(true);
  });

  test('mint tokens', async () => {
    await expect(raiden.mint(getToken(), parseEther('1'))).resolves.toMatch('0x');
    await expect(raiden.getTokenBalance(getToken())).resolves.toStrictEqual(parseEther('1'));
  });

  test('open and fund channel with 1st node', async () => {
    await expect(
      raiden.openChannel(getToken(), partner1, { deposit: parseEther('1') }),
    ).resolves.toMatch('0x');
  });

  test('transfer to 2nd node', async () => {
    await expect(raiden.transfer(getToken(), partner2, 1)).resolves.toMatch('0x');
  });
});
