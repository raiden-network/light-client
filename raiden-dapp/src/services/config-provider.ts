import { ContractsInfo } from 'raiden-ts';

export class ConfigProvider {
  static async contracts(): Promise<ContractsInfo | undefined> {
    const {
      VUE_APP_DEPLOYMENT_INFO: deploymentInfoFilePath,
      VUE_APP_DEPLOYMENT_SERVICES_INFO: deploymentServicesInfoFilePath,
    } = process.env;

    if (deploymentInfoFilePath && deploymentServicesInfoFilePath) {
      const [
        deploymentInfoFile,
        deploymentServicesInfoFile,
      ] = await Promise.all([
        fetch(deploymentInfoFilePath),
        fetch(deploymentServicesInfoFilePath),
      ]);
      const [deployment, serviceDeployment] = await Promise.all([
        deploymentInfoFile.json(),
        deploymentServicesInfoFile.json(),
      ]);

      return ({
        ...deployment.contracts,
        ...serviceDeployment.contracts,
      } as unknown) as ContractsInfo;
    }
    return undefined;
  }

  static async configuration(): Promise<Configuration> {
    const configurationUrl =
      process.env.VUE_APP_CONFIGURATION_URL || './config.json';
    const response = await fetch(configurationUrl);
    return (await response.json()) as Configuration;
  }
}

export interface Configuration {
  readonly rpc_endpoint?: string;
  readonly private_key?: string;
  readonly per_network: { [key: string]: NetworkConfiguration };
}

export interface NetworkConfiguration {
  readonly monitored: string[];
}
