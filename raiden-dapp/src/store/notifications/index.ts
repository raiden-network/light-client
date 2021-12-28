import type { Module } from 'vuex';

import { getters } from './getters';
import { mutations } from './mutations';
import state from './state';
import type { NotificationsState, RootStateWithNotifications } from './types';

export const notifications: Module<NotificationsState, RootStateWithNotifications> = {
  namespaced: true,
  mutations,
  state,
  getters,
};
