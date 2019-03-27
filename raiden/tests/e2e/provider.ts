import ganache, { GanacheServerOptions } from 'ganache-cli';
import memdown from 'memdown';
import { Web3Provider } from 'ethers/providers';

export class TestProvider extends Web3Provider {
  public constructor(opts?: GanacheServerOptions) {
    super(
      ganache.provider({
        total_accounts: 3, // eslint-disable-line
        default_balance_ether: 5, // eslint-disable-line
        seed: 'testrpc_provider',
        db: memdown(),
        ...opts,
      }),
    );
  }

  public snapshot(): Promise<number> {
    return this.send('evm_snapshot', null);
  }

  public revert(id: number): Promise<boolean> {
    return this.send('evm_revert', id);
  }

  public async mine(count: number = 1): Promise<void> {
    for (let i = 0; i < count; i++) {
      await this.send('evm_mine', null);
    }
  }
}
