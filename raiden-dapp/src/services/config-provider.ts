import { ContractsInfo } from 'raiden-ts';

export class ConfigProvider {
  static async fetch(
    url?: string
  ): Promise<{ INFURA_ENDPOINT: string; PRIVATE_KEY: string } | undefined> {
    if (url) return await (await fetch(url)).json();

    return undefined;
  }

  static async contracts(): Promise<ContractsInfo | undefined> {
    const {
      VUE_APP_DEPLOYMENT_INFO: deploymentInfoFilePath,
      VUE_APP_DEPLOYMENT_SERVICES_INFO: deploymentServicesInfoFilePath
    } = process.env;

    if (deploymentInfoFilePath && deploymentServicesInfoFilePath) {
      const [
        deploymentInfoFile,
        deploymentServicesInfoFile
      ] = await Promise.all([
        fetch(deploymentInfoFilePath),
        fetch(deploymentServicesInfoFilePath)
      ]);
      const [deployment, serviceDeployment] = await Promise.all([
        deploymentInfoFile.json(),
        deploymentServicesInfoFile.json()
      ]);

      return ({
        ...deployment.contracts,
        ...serviceDeployment.contracts
      } as unknown) as ContractsInfo;
    }
    return undefined;
  }
}
