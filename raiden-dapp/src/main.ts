/* istanbul ignore file */
import Vue from 'vue';
import App from './App.vue';
import '@/plugins/class-component.hooks';
import '@/filters';
import router from './router/index';
import store from './store/index';
import { setupLogStore } from './utils/logstore';
import './class-component-hooks';
import { RaidenPlugin } from '@/plugins/raiden';
import { IdenticonPlugin } from '@/plugins/identicon-plugin';
import i18n from './i18n';
import vuetify from '@/plugins/vuetify';
import VueVirtualScroller from 'vue-virtual-scroller';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';
import './registerServiceWorker';

Vue.config.productionTip = false;

setupLogStore();

Vue.use(RaidenPlugin);
Vue.use(IdenticonPlugin);
Vue.use(VueVirtualScroller);

new Vue({
  vuetify,
  router,
  store,
  i18n,
  render: (h) => h(App),
}).$mount('#app');
