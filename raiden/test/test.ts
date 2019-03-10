import { LocalStorage } from 'node-localstorage';

import { Raiden } from '..';

const testNode = 'http://geth.ropsten.ethnodes.brainbot.com:8545',
  testPK = '0x0123456789012345678901234567890123456789012345678901234567890123';


async function dummyTest(): Promise<void> {
  const localStorage = new LocalStorage('./.localstorage');
  const raiden = await Raiden.create(testNode, testPK, localStorage);

  const blockNumber = await raiden.getBlockNumber();
  console.log(`Connected to node ${testNode} with account ${raiden.address}, ` +
    `current blockNumber: ${blockNumber}`);

  console.log('monitorToken', await raiden.monitorToken('0xc778417E063141139Fce010982780140Aa0cD5Ab'));

  await new Promise(resolve => setTimeout(resolve, 10e3));

  try {
    console.log('openChannel', await raiden.openChannel('0xc778417E063141139Fce010982780140Aa0cD5Ab', '0xdeadbeef', 17));
  } catch(err) {
    console.error('openChannelFailed', err);
  }
}

dummyTest();
