import { OpenMode, promises as fs } from 'fs';
import { filter } from 'rxjs/operators';
import { BigNumber } from '@ethersproject/bignumber';
import { Wallet } from '@ethersproject/wallet';
import type { Signer } from '@ethersproject/abstract-signer';

import { assert } from 'raiden-ts/utils';
import { Raiden } from 'raiden-ts/raiden';
import { ContractsInfo } from 'raiden-ts/types';
import { RaidenPaths } from 'raiden-ts/services/types';

jest.setTimeout(120000);

const ethBalance = '100000000000000000000000';
const tttBalance = '1000000000000000000000';
const svtBalance = '1000000000000000000000';
const signer = new Wallet('0x0123456789012345678901234567890123456789012345678901234567890123');
const partner1 = '0x517aAD51D0e9BbeF3c64803F86b3B9136641D9ec';
const partner2 = '0xCBC49ec22c93DB69c78348C90cd03A323267db86';

async function createRaiden(account: number | string | Signer): Promise<Raiden> {
  const deploymentInfoFile = process.env.DEPLOYMENT_INFO;
  const deploymentServiceInfoFile = process.env.DEPLOYMENT_SERVICES_INFO;

  assert(deploymentInfoFile !== undefined);
  assert(deploymentServiceInfoFile !== undefined);
  assert(await fs.stat(deploymentInfoFile));
  assert(await fs.stat(deploymentServiceInfoFile));

  const options: { encoding: BufferEncoding; flag?: OpenMode } = { encoding: 'utf8', flag: 'r' };

  const deployFile = (await fs.readFile(deploymentInfoFile, options)) as string;
  const servicesDeployFile = (await fs.readFile(deploymentServiceInfoFile, options)) as string;

  const deploy = JSON.parse(deployFile);
  const servicesDeploy = JSON.parse(servicesDeployFile);

  const contractsInfo = ({
    ...deploy.contracts,
    ...servicesDeploy.contracts,
  } as unknown) as ContractsInfo;

  return await Raiden.create(
    'http://localhost:8545',
    account,
    { adapter: 'memory' },
    contractsInfo,
    {
      pfs: 'http://localhost:6000',
      matrixServer: 'http://localhost',
      revealTimeout: 10,
      settleTimeout: 50,
      confirmationBlocks: 1,
    },
  );
}

const wait = async (timeInMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(() => resolve(), timeInMs));

function getToken(): string {
  const token = process.env.TTT_TOKEN_ADDRESS;
  assert(token !== undefined, 'TTT Token address is undefined');
  return token;
}

describe('e2e', () => {
  let raiden: Raiden;

  beforeAll(async () => {
    raiden = await createRaiden(signer);
    raiden.start();
  });

  afterAll((done) => {
    raiden.events$.pipe(filter((value) => value.type === 'raiden/shutdown')).subscribe(done);
    raiden.stop();
  });

  test('account is funded', async () => {
    await expect(raiden.getBalance(raiden.address)).resolves.toEqual(BigNumber.from(ethBalance));
  });

  describe('mediated transfer', () => {
    let routes: RaidenPaths;

    test('mint TTT', async () => {
      await expect(raiden.mint(getToken(), tttBalance)).resolves.toMatch('0x');
      await expect(raiden.getTokenBalance(getToken())).resolves.toStrictEqual(
        BigNumber.from(tttBalance),
      );
    });

    test('open channel with partner #1', async () => {
      await expect(
        raiden.openChannel(getToken(), partner1, { deposit: tttBalance }),
      ).resolves.toMatch('0x');
    });

    test('mint SVT', async () => {
      await expect(
        raiden.mint(process.env.SVT_TOKEN_ADDRESS as string, svtBalance),
      ).resolves.toMatch('0x');
      await expect(
        raiden.getTokenBalance(process.env.SVT_TOKEN_ADDRESS as string),
      ).resolves.toStrictEqual(BigNumber.from(svtBalance));
    });

    test('deposit to UDC', async () => {
      await expect(raiden.depositToUDC(svtBalance)).resolves.toMatch('0x');
      await expect(raiden.getUDCCapacity()).resolves.toStrictEqual(BigNumber.from(svtBalance));

      // Give PFS some time
      await wait(3000);
    });

    test('find routes to partner #2', async () => {
      await expect(raiden.getAvailability(partner2)).resolves.toMatchObject({ available: true });
      routes = await raiden.findRoutes(getToken(), partner2, 50);
      expect(routes).toMatchObject([{ fee: BigNumber.from(0), path: [partner1, partner2] }]);
    });

    test('10 consecutive transfers to partner #2', async () => {
      expect.assertions(10);
      for (let i = 0; i < 10; i++) {
        await expect(
          raiden.transfer(getToken(), partner2, 50, { paths: routes }),
        ).resolves.toMatch('0x');
      }
    });
  });
});
