export class ConfigProvider {
  static async fetch(
    url?: string
  ): Promise<{ INFURA_ENDPOINT: string; PRIVATE_KEY: string } | undefined> {
    if (url) return await (await fetch(url)).json();

    return undefined;
  }
}
