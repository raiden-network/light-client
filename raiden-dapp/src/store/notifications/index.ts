import { Module } from 'vuex';
import { mutations } from './mutations';
import { getters } from './getters';
import state from './state';
import { RootState } from '@/types';
import { NotificationsState } from '@/store/notifications/types';

export const notifications: Module<NotificationsState, RootState> = {
  namespaced: true,
  mutations,
  state,
  getters,
};
