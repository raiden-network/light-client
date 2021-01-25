/* istanbul ignore file */
import Vue from 'vue';
import App from './App.vue';
import '@/plugins/class-component.hooks';
import '@/filters';
import router from './router/index';
import store from './store/index';
import { setupLogStore } from './utils/logstore';
import './class-component-hooks';
import i18n from './i18n';
import { RaidenPlugin } from '@/plugins/raiden';
import { IdenticonPlugin } from '@/plugins/identicon-plugin';
import vuetify from '@/plugins/vuetify';
import { ServiceWorkerAssistantPlugin } from '@/plugins/service-worker-assistant-plugin';

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
  render: (h) => h(App),
}).$mount('#app');
