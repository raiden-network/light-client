import { TestProvider } from './provider';

describe('tokenMonitor', () => {
  const provider = new TestProvider();
  let snapId: number;

  beforeEach(async () => {
    snapId = await provider.snapshot();
  });

  afterEach(async () => {
    await provider.revert(snapId);
  });

  test('tokenMonitor success', async () => {
    await provider.mine(10);
    const bn = await provider.getBlockNumber();
    expect(bn).toBe(10);
  });

  test('tokenMonitor success2', async () => {
    await provider.mine(11);
    const bn = await provider.getBlockNumber();
    expect(bn).toBe(11);
  });
});
