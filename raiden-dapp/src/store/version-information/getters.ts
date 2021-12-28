import { compare as compareVersions } from 'compare-versions';
import type { GetterTree } from 'vuex';

import type {
  RootStateWithVersionInformation,
  VersionInformationGetters,
  VersionInformationState,
} from './types';


export const getters: GetterTree<VersionInformationState, RootStateWithVersionInformation> & VersionInformationGetters =
{
  updateIsAvailable(state) {
    const { activeVersion, availableVersion } = state;
    return (
      !!activeVersion &&
      !!availableVersion &&
      compareVersions(availableVersion, activeVersion, '>')
    );
  },
};
