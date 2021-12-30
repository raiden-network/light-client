export interface VersionInformationState {
  activeVersion: string;
  installedVersion: string | undefined;
  availableVersion: string | undefined;
  updateIsMandatory: boolean;
  updateInProgress: boolean;
}

export interface RootStateWithVersionInformation {
  versionInformation: VersionInformationState;
}

export type VersionInformationGetters<S = VersionInformationState> = {
  correctVersionIsLoaded: (state: S) => boolean;
  updateIsAvailable: (state: S) => boolean;
};

export type VersionInformationMutations<S = VersionInformationState> = {
  setInstalledVersion(state: S, version: string): void;
  setAvailableVersion(state: S, version: string): void;
  setUpdateIsMandatory(state: S): void;
  prepareUpdate(state: S): void;
};
