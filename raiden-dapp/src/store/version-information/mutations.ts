import { validate as validateVersion } from 'compare-versions';
import type { MutationTree } from 'vuex';

import type { VersionInformationMutations, VersionInformationState } from './types';

export const mutations: MutationTree<VersionInformationState> & VersionInformationMutations = {
  setInstalledVersion(state, version) {
    if (validateVersion(version)) {
      state.installedVersion = version;
    }
  },
  setAvailableVersion(state, version) {
    if (validateVersion(version)) {
      state.availableVersion = version;
    }
  },
  setUpdateIsMandatory(state) {
    state.updateIsMandatory = true;
  },
  prepareUpdate(state) {
    // Setting the installed version to undefined will allow to load a new
    // version without setting it back to the installed version. This is
    // necessary to allow this new loaded version to install itself, when it is
    // intended.
    state.installedVersion = undefined;
  },
};
