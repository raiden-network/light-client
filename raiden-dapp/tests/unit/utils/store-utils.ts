import store from '@/store';

export function connectAccount() {
  store.commit('account', '0x0000000000000000000000000000000000020001');
  store.commit('loadComplete', true);
}
