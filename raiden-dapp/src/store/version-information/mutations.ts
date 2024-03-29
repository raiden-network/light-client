import { validate as validateVersion } from 'compare-versions';
import type { MutationTree } from 'vuex';

import type { VersionInformationMutations, VersionInformationState } from './types';

export const mutations: MutationTree<VersionInformationState> & VersionInformationMutations = {
  setInstalledVersion(state, version) {
    if (validateVersion(version)) {
      state.installedVersion = version;
    }

    state.updateInProgress = false;
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
    state.updateInProgress = true;
  },
};
