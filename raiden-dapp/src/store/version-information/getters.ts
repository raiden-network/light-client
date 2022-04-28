import { compare as compareVersions, validate as validateVersion } from 'compare-versions';
import type { GetterTree } from 'vuex';

import { DISCLAIMER_STORAGE_KEY } from '@/store/constants';

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

// This detection mechanism here isn't very nice. It is not possible to access
// the data from the root store as it does not allow to distinguish the state.
// Only when the user has accepted the disclaimer in the past, this data
// exists. This also means this check here only works when evaluated before the
// user accepts the disclaimer for the first time. In general it would be better
// to have any other mechanism to detect the same information. Unfortunately
// this must work with old versions of the client. This is the only and final
// idea we came up with.
function userLoadedApplicationForTheFirstTime(): boolean {
  return localStorage.getItem(DISCLAIMER_STORAGE_KEY) === null;
}

export const getters: GetterTree<VersionInformationState, RootStateWithVersionInformation> &
  VersionInformationGetters = {
  correctVersionIsLoaded(state) {
    if (
      userLoadedApplicationForTheFirstTime() ||
      state.updateInProgress ||
      process.env.VUE_APP_SERVICE_WORKER_DISABLED === 'true'
    ) {
      return true;
    }

    const { installedVersion, activeVersion } = state;

    if (installedVersion === undefined) {
      // Only versions up to this number do not persist this information.
      return compareSemanticVersions(activeVersion, '2.0.1', '<=');
    } else {
      return compareSemanticVersions(installedVersion, activeVersion, '=');
    }
  },
  updateIsAvailable(state) {
    return compareSemanticVersions(state.availableVersion, state.installedVersion, '>');
  },
};
