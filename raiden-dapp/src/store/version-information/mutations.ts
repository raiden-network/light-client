import { validate as validateVersion } from 'compare-versions';
import type { MutationTree } from 'vuex';

import type { VersionInformationMutations, VersionInformationState } from './types';

export const mutations: MutationTree<VersionInformationState> & VersionInformationMutations = {
  setAvailableVersion(state, version) {
    if (validateVersion(version)) {
      state.availableVersion = version;
    }
  },
  setUpdateIsMandatory(state) {
    state.updateIsMandatory = true;
  },
};
