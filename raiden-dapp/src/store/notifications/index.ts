import type { Module } from 'vuex';

import type { NotificationsState } from '@/store/notifications/types';
import type { RootState } from '@/types';

import { getters } from './getters';
import { mutations } from './mutations';
import state from './state';

export const notifications: Module<NotificationsState, RootState> = {
  namespaced: true,
  mutations,
  state,
  getters,
};
