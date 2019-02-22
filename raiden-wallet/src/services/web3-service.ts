import Web3 from 'web3';

export enum ProviderState {
  NO_PROVIDER,
  DENIED_ACCESS,
  INITIALIZED
}
export default class Web3Service {
  private web3?: Web3;

  constructor() {
    this.web3 = undefined;
  }

  async detectProvider(): Promise<ProviderState> {
    const ethereum = window.ethereum;
    if (typeof ethereum !== 'undefined') {
      this.web3 = new Web3(ethereum);
      try {
        await ethereum.enable();
        return ProviderState.INITIALIZED;
      } catch (error) {
        return ProviderState.DENIED_ACCESS;
      }
    } else if (window.web3) {
      this.web3 = new Web3(window.web3.currentProvider);
      return ProviderState.INITIALIZED;
    } else {
      console.error(
        'Non-Ethereum browser detected. You should consider trying MetaMask!'
      );
      return ProviderState.NO_PROVIDER;
    }
  }

  async getAccount(): Promise<string> {
    const web3 = this.web3Instance();
    const accounts = await web3.eth.getAccounts();
    return accounts[0] || '';
  }

  async getBalance(): Promise<string> {
    const web3 = this.web3Instance();
    const account = await this.getAccount();
    const balance = await web3.eth.getBalance(account);
    return web3.utils.fromWei(balance, 'ether');
  }

  private web3Instance() {
    if (this.web3 === undefined) {
      throw new Error('Web3 instance was not initialized');
    } else {
      return this.web3;
    }
  }
}
