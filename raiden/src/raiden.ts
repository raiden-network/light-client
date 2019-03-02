import { Wallet, Signer } from 'ethers';
import { AsyncSendable, Web3Provider, JsonRpcProvider } from 'ethers/providers';


export class Raiden {
  private provider: JsonRpcProvider;
  public signer?: Signer;
  public address?: string;

  public constructor(provider: AsyncSendable | string, account?: Wallet | string) {
    if (typeof provider === 'string') {
      this.provider = new JsonRpcProvider(provider);
    } else {
      this.provider = new Web3Provider(provider);
    }
    if (account) {
      this.loadAccount(account);
    }
  }

  public async listAccounts(): Promise<string[]> {
    return this.provider.listAccounts();
  }

  public async loadAccount(account: Wallet | string): Promise<string> {
    if (account instanceof Wallet) {
      this.signer = account.connect(this.provider);
      this.address = await this.signer.getAddress();
      return this.address;
    }
    let accounts = await this.listAccounts();
    if (accounts.indexOf(account) < 0)
      throw `Account "${account}" not found, got=${accounts}`;
    this.signer = this.provider.getSigner(account);
    this.address = account;
    return this.address;
  }

  public async getBlockNumber(): Promise<number> {
    return this.provider.getBlockNumber();
  }
}

export default Raiden;
