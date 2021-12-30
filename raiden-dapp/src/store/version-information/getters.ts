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
  operator: '<' | '<=' | '=' | '>',
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
    if (state.updateInProgress) {
      return true; // During an update it can never be a wrong version.
    }

    const { installedVersion, activeVersion } = state;

    if (installedVersion === undefined) {
      // Only versions up to this number do not persist this information.
      return compareSemanticVersions(activeVersion, '2.0.1', '<=');
    }

    return compareSemanticVersions(installedVersion, activeVersion, '=');
  },
  updateIsAvailable(state) {
    return compareSemanticVersions(state.availableVersion, state.installedVersion, '>');
  },
};
