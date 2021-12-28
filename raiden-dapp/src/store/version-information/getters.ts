import { compare as compareVersions } from 'compare-versions';
import type { GetterTree } from 'vuex';

import type { RootState } from '@/types';

import type { VersionInformationGetters, VersionInformationState } from './types';

export const getters: GetterTree<VersionInformationState, RootState> & VersionInformationGetters =
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
