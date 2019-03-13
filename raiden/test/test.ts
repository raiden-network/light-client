//import { promises as fsp } from 'fs';
import readline from 'readline';
import { LocalStorage } from 'node-localstorage';
import { formatEther } from 'ethers/utils';

import { Raiden } from '..';

const testNode = 'http://geth.ropsten.ethnodes.brainbot.com:8545',
  testPK = '0x0123456789012345678901234567890123456789012345678901234567890123';

const token = '0xc778417E063141139Fce010982780140Aa0cD5Ab';


async function dummyTest(): Promise<void> {
  const localStorage = new LocalStorage('./.localstorage');
  let pk = testPK;
  if (process.argv[2]) {
    //const jsonFile = await fsp.readFile(process.argv[2], 'utf-8') as string;
    //const jsonPK = JSON.parse(jsonFile);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    pk = await new Promise<string>(resolve => rl.question('PK: ', resolve));
  }
  const raiden = await Raiden.create(testNode, pk, localStorage);

  const blockNumber = await raiden.getBlockNumber();
  const balance = await raiden.getBalance();
  console.log(`Connected to node ${testNode} with account ${raiden.address}, ` +
    `current blockNumber: ${blockNumber}, balance: ${formatEther(balance)}`);

  await new Promise(resolve => setTimeout(resolve, 10e3));
  console.log('monitorToken', await raiden.monitorToken(token));
  console.log('tokenBalance', await raiden.getTokenBalance(token));

  //console.log('depositChannel', await raiden.depositChannel('0xc778417E063141139Fce010982780140Aa0cD5Ab', '0x3333333333333333333333333333333333333333', 123));

  /*try {
    console.log('openChannel', await raiden.openChannel('0xc778417E063141139Fce010982780140Aa0cD5Ab', '0x3333333333333333333333333333333333333333'));
  } catch(err) {
    console.error('openChannelFailed', err);
  }*/
}

dummyTest();
