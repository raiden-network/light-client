import type { Signer } from '@ethersproject/abstract-signer';
import { BigNumber } from '@ethersproject/bignumber';
import { Wallet } from '@ethersproject/wallet';
import type { OpenMode } from 'fs';
import { promises as fs } from 'fs';
import { firstValueFrom } from 'rxjs';

import { Capabilities } from '@/constants';
import { Raiden } from '@/raiden';
import type { RaidenPaths } from '@/services/types';
import { PfsMode } from '@/services/types';
import type { ContractsInfo } from '@/types';
import { assert } from '@/utils';
import type { Address } from '@/utils/types';

jest.setTimeout(500_000);

const svtBalance = '1000000000000000000000';
const signer = new Wallet('0x0123456789012345678901234567890123456789012345678901234567890123');
const signer2 = new Wallet('0x0123456789012345678901234567890123456789012345678901234567890124');
const partner1 = '0x517aAD51D0e9BbeF3c64803F86b3B9136641D9ec' as Address;
const partner2 = '0xCBC49ec22c93DB69c78348C90cd03A323267db86' as Address;

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

  const contractsInfo = {
    ...deploy.contracts,
    ...servicesDeploy.contracts,
  } as unknown as ContractsInfo;

  return await Raiden.create(
    'http://localhost:8545',
    account,
    { adapter: 'memory' },
    contractsInfo,
    {
      additionalServices: ['http://localhost:5555'],
      pfsMode: PfsMode.onlyAdditional,
      matrixServer: 'http://localhost:9080',
      revealTimeout: 20,
      settleTimeout: 40,
      pollingInterval: 1_000,
      httpTimeout: 10_000,
      expiryFactor: 2.0,
      confirmationBlocks: 5,
      autoSettle: false, // required to use `settleChannel` later
      autoUDCWithdraw: false, // required to use `withdrawFromUDC` later
      caps: {
        [Capabilities.RECEIVE]: 1,
      },
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

async function getChannelCapacity(raiden: Raiden, partner: Address): Promise<BigNumber> {
  const tokenAddress = getToken();
  const channels = await firstValueFrom(raiden.channels$);
  const partnerChannel = channels[tokenAddress][partner];
  return partnerChannel.capacity;
}

async function depositToUDC(raiden: Raiden) {
  await expect(raiden.mint(process.env.SVT_TOKEN_ADDRESS as string, svtBalance)).resolves.toMatch(
    '0x',
  );
  await expect(
    raiden.getTokenBalance(process.env.SVT_TOKEN_ADDRESS as string),
  ).resolves.toBeBigNumber(svtBalance);

  await expect(raiden.depositToUDC(svtBalance)).resolves.toMatch('0x');
  await expect(raiden.getUDCCapacity()).resolves.toBeBigNumber(svtBalance);

  await expect(
    raiden.getTokenBalance(process.env.SVT_TOKEN_ADDRESS as string),
  ).resolves.toBeBigNumber(0);

  // Give PFS some time
  await wait(3_000);
}

describe('e2e', () => {
  let raiden: Raiden;
  let raiden2: Raiden;

  beforeAll(async () => {
    raiden = await createRaiden(signer);
    raiden.start();
    raiden2 = await createRaiden(signer2);
    raiden2.start();
  });

  afterAll(async () => {
    await raiden.stop();
    await raiden2.stop();
  });

  /*
   * This runs a scenario that incorporates all functionality of the SDK.
   *
   * This includes:
   * - Deposit and withdrawal from the UDC, including token minting
   * - Opening of channels
   * - Deposit and withdrawal of channels with PC and LC partners
   * - Direct and mediated transfers using PC and LC implementations
   * - Channel closing and settlement
   *
   * The topology of the nodes is the following:
   *
   * (PC1) ---- (PC2)
   *   |          |
   *   |          |
   *   |          |
   * (LC1) ---- (LC2)
   *
   */
  test('scenario', async () => {
    await depositToUDC(raiden);

    /*
     * Direct transfer from LC1 to PC1, exhaust channel
     */
    const amount = 100;
    await expect(raiden.mint(getToken(), amount)).resolves.toMatch('0x');
    await expect(raiden.getTokenBalance(getToken())).resolves.toBeBigNumber(amount);
    await expect(raiden.openChannel(getToken(), partner1, { deposit: amount })).resolves.toMatch(
      '0x',
    );

    await wait(3_000);

    await expect(getChannelCapacity(raiden, partner1)).resolves.toBeBigNumber(amount);
    // check error for impossible transfer
    await expect(raiden.transfer(getToken(), partner1, amount + 1)).toReject();
    // exhaust our side of the channel
    let key = await raiden.transfer(getToken(), partner1, amount);
    await raiden.waitTransfer(key);

    await expect(getChannelCapacity(raiden, partner1)).resolves.toBeBigNumber(0);

    /*
     * Direct transfer from LC1 to LC2
     */
    await depositToUDC(raiden2);
    await expect(raiden.mint(getToken(), amount)).resolves.toMatch('0x');
    await expect(raiden.getTokenBalance(getToken())).resolves.toBeBigNumber(amount);
    await expect(
      raiden.openChannel(getToken(), raiden2.address, { deposit: amount }),
    ).resolves.toMatch('0x');

    await expect(getChannelCapacity(raiden, raiden2.address)).resolves.toBeBigNumber(amount);
    await expect(getChannelCapacity(raiden2, raiden.address)).resolves.toBeBigNumber(0);
    // check error for impossible transfer
    await expect(raiden.transfer(getToken(), raiden2.address, amount + 1)).toReject();
    // exhaust our side of the channel
    key = await raiden.transfer(getToken(), raiden2.address, amount);
    await raiden.waitTransfer(key);

    await expect(getChannelCapacity(raiden, raiden2.address)).resolves.toBeBigNumber(0);
    await expect(getChannelCapacity(raiden2, raiden.address)).resolves.toBeBigNumber(amount);

    /*
     * Deposit and partly withdraw from LC1
     */
    const withdraw_amount = 50;
    await expect(raiden.mint(getToken(), amount)).resolves.toMatch('0x');
    await expect(raiden.getTokenBalance(getToken())).resolves.toBeBigNumber(amount);
    await expect(raiden.depositChannel(getToken(), partner1, amount)).resolves.toMatch('0x');
    await expect(getChannelCapacity(raiden, partner1)).resolves.toBeBigNumber(amount);

    await expect(raiden.withdrawChannel(getToken(), partner1, withdraw_amount)).resolves.toMatch(
      '0x',
    );
    await expect(getChannelCapacity(raiden, partner1)).resolves.toBeBigNumber(
      amount - withdraw_amount,
    );

    /*
     * Send mediated payment with PC as mediator
     */
    const amount2 = 35;
    await wait(5_000);

    await expect(raiden.getAvailability(partner1)).resolves.toMatchObject({ available: true });
    await expect(raiden.getAvailability(partner2)).resolves.toMatchObject({ available: true });

    expect(getChannelCapacity(raiden, partner1)).resolves.toBeBigNumber(amount - withdraw_amount);

    const routes: RaidenPaths = await raiden.findRoutes(getToken(), partner2, amount2);
    expect(routes).toMatchObject([
      { fee: BigNumber.from(0), path: [raiden.address, partner1, partner2] },
    ]);

    key = await raiden.transfer(getToken(), partner2, amount2, { paths: routes });
    await raiden.waitTransfer(key);

    expect(getChannelCapacity(raiden, partner1)).resolves.toBeBigNumber(
      amount - withdraw_amount - amount2,
    );

    /*
     * Close channel with PC
     */
    await expect(raiden.closeChannel(getToken(), partner1)).resolves.toMatch('0x');

    const settlePromise = raiden.settleChannel(getToken(), partner1);

    /*
     * Deposit and withdraw between two LCs
     *
     * 50 tokens are left from withdraw above, so no need to mint.
     */
    const withdrawAmount2 = 10;
    await expect(
      raiden.depositChannel(getToken(), raiden2.address, withdraw_amount),
    ).resolves.toMatch('0x');
    await expect(getChannelCapacity(raiden, raiden2.address)).resolves.toBeBigNumber(
      withdraw_amount,
    );

    await expect(
      raiden.withdrawChannel(getToken(), raiden2.address, withdrawAmount2),
    ).resolves.toMatch('0x');
    await expect(getChannelCapacity(raiden, raiden2.address)).resolves.toBeBigNumber(
      withdraw_amount - withdrawAmount2,
    );

    /*
     * Send mediated payment with LC as mediator
     *
     * For this we need to enable mediation in LC2
     */
    raiden2.updateConfig({
      caps: {
        [Capabilities.MEDIATE]: 1,
      },
    });
    await expect(raiden2.mint(getToken(), amount)).resolves.toMatch('0x');
    await expect(raiden2.getTokenBalance(getToken())).resolves.toBeBigNumber(amount);
    await expect(raiden2.openChannel(getToken(), partner2, { deposit: amount })).resolves.toMatch(
      '0x',
    );
    await expect(getChannelCapacity(raiden2, partner2)).resolves.toBeBigNumber(amount);

    // PC nodes need a long time to send capacity updates
    await wait(10_000);
    const sendAmount = 35;

    const routes2: RaidenPaths = await raiden.findRoutes(getToken(), partner2, sendAmount);
    expect(routes2).toMatchObject([
      { fee: BigNumber.from(0), path: [raiden.address, raiden2.address, partner2] },
    ]);

    key = await raiden.transfer(getToken(), partner2, sendAmount, { paths: routes2 });
    await raiden.waitTransfer(key);

    await expect(getChannelCapacity(raiden, raiden2.address)).resolves.toBeBigNumber(
      withdraw_amount - withdrawAmount2 - sendAmount,
    );
    await expect(getChannelCapacity(raiden2, partner2)).resolves.toBeBigNumber(
      amount - sendAmount,
    );

    await expect(settlePromise).resolves.toMatch('0x');

    /*
     * Withdraw from UDC
     */
    const udcWithdrawAmount = 10;
    await expect(
      raiden.getTokenBalance(process.env.SVT_TOKEN_ADDRESS as string),
    ).resolves.toBeBigNumber(0);

    await expect(raiden.planUDCWithdraw(udcWithdrawAmount)).resolves.toMatch('0x');
    await expect(raiden.withdrawFromUDC(udcWithdrawAmount)).resolves.toMatch('0x');

    await expect(
      raiden.getTokenBalance(process.env.SVT_TOKEN_ADDRESS as string),
    ).resolves.toBeBigNumber(udcWithdrawAmount);
  });
});
