export interface VersionInformationState {
  activeVersion: string;
  availableVersion: string | undefined;
  updateIsMandatory: boolean;
}

export type VersionInformationGetters<S = VersionInformationState> = {
  updateIsAvailable: (state: S) => boolean;
};

export type VersionInformationMutations<S = VersionInformationState> = {
  setAvailableVersion(state: S, version: string): void;
  setUpdateIsMandatory(state: S): void;
};
