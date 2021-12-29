import { compare as compareVersions, validate as validateVersion } from 'compare-versions';
import type { GetterTree } from 'vuex';

import type {
  RootStateWithVersionInformation,
  VersionInformationGetters,
  VersionInformationState,
} from './types';

/*
 * Use a wrapper around the 3rd party library. The main reason for this is that
 * the external `validate` function throws errors if any of the version arguments
 * is not in a valid format. As the getters require to stricktly return
 * a Boolean, it is necessary to first validate the format of the arguments
 * before comparing them.
 */
function compareSemanticVersions(
  firstVersion: unknown,
  secondVersion: unknown,
  operator: '<' | '=' | '>',
): boolean {
  return (
    validateVersion(firstVersion as string) &&
    validateVersion(secondVersion as string) &&
    compareVersions(firstVersion as string, secondVersion as string, operator)
  );
}

export const getters: GetterTree<VersionInformationState, RootStateWithVersionInformation> &
  VersionInformationGetters = {
  correctVersionIsLoaded(state) {
    const { installedVersion, activeVersion } = state;
    const noVersionIsInstalled = installedVersion === undefined;
    return (
      noVersionIsInstalled || // In case of an initial load or update it is always correct.
      compareSemanticVersions(installedVersion, activeVersion, '=')
    );
  },
  updateIsAvailable(state) {
    return compareSemanticVersions(state.availableVersion, state.installedVersion, '>');
  },
};