import { actions } from './actions';
import { mutations } from './mutations';
import { getters } from './getters';
import state from './state';
import { RootState } from '@/types';
import { NotificationsState } from '@/store/notifications/types';
import { Module } from 'vuex';

export const notifications: Module<NotificationsState, RootState> = {
  namespaced: true,
  mutations,
  actions,
  state,
  getters
};
