import makeBlockie from 'ethereum-blockies-base64';

export class IdenticonCache {
  private cache: { [id: string]: string } = {};

  public getIdenticon(address: string): string {
    const cached = this.cache[address];

    if (!cached) {
      const generated = makeBlockie(address);
      this.cache[address] = generated;
      return generated;
    } else {
      return cached;
    }
  }
}
