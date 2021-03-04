/* istanbul ignore file */
import '@/plugins/class-component.hooks';
import '@/filters';
import './class-component-hooks';

import { Plugins } from '@capacitor/core';
import Vue from 'vue';

import { IdenticonPlugin } from '@/plugins/identicon-plugin';
import { RaidenPlugin } from '@/plugins/raiden';
import { ServiceWorkerAssistantPlugin } from '@/plugins/service-worker-assistant-plugin';
import vuetify from '@/plugins/vuetify';

import App from './App.vue';
import i18n from './i18n';
import router from './router/index';
import store from './store/index';
import { setupLogStore } from './utils/logstore';

Vue.config.productionTip = false;

setupLogStore();

Vue.use(RaidenPlugin);
Vue.use(IdenticonPlugin);
Vue.use(ServiceWorkerAssistantPlugin);

new Vue({
  vuetify,
  router,
  store,
  i18n,
  mounted() {
    Plugins.SplashScreen.hide();
  },
  render: (h) => h(App),
}).$mount('#app');
