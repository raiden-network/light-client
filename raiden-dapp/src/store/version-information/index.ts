import type { Module } from 'vuex';

import type { RootState } from '@/types';

import { getters } from './getters';
import { mutations } from './mutations';
import state from './state';
import type { VersionInformationState } from './types';

export const versionInformation: Module<VersionInformationState, RootState> = {
  namespaced: true,
  state,
  getters,
  mutations,
};

export * from './types';
