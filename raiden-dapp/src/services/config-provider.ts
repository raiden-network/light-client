import type { ContractsInfo } from 'raiden-ts';

export class ConfigProvider {
  static async contracts(): Promise<ContractsInfo | undefined> {
    try {
      const {
        VUE_APP_DEPLOYMENT_INFO: deploymentInfoFilePath,
        VUE_APP_DEPLOYMENT_SERVICES_INFO: deploymentServicesInfoFilePath,
      } = process.env;

      if (deploymentInfoFilePath && deploymentServicesInfoFilePath) {
        const [deploymentInfoFile, deploymentServicesInfoFile] = await Promise.all([
          fetch(deploymentInfoFilePath),
          fetch(deploymentServicesInfoFilePath),
        ]);

        const [deployment, serviceDeployment] = await Promise.all([
          deploymentInfoFile.json(),
          deploymentServicesInfoFile.json(),
        ]);

        return {
          ...deployment.contracts,
          ...serviceDeployment.contracts,
        } as unknown as ContractsInfo;
      }
      return undefined;
    } catch (error) {
      throw new DeploymentInfoParsingFailed((error as Error).message);
    }
  }

  static async configuration(): Promise<Configuration> {
    const configurationUrl = process.env.VUE_APP_CONFIGURATION_URL || './config.json';
    const response = await fetch(configurationUrl);
    return (await response.json()) as Configuration;
  }
}

export interface Configuration {
  readonly per_network: { [key: string]: NetworkConfiguration };
  readonly disabled_ethereum_providers?: string[];
}

export interface NetworkConfiguration {
  readonly monitored: string[];
}

export class DeploymentInfoParsingFailed extends Error {}
