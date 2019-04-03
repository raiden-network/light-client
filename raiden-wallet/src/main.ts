import Vue from 'vue';
import './plugins/vuetify';
import './filters';
import App from './App.vue';
import router from './router';
import store from './store';
import './registerServiceWorker';
import { RaidenPlugin } from '@/plugins/raiden';
import { IdenticonPlugin } from '@/plugins/identicon-plugin';

Vue.config.productionTip = false;

Vue.use(RaidenPlugin);
Vue.use(IdenticonPlugin);

new Vue({
  router,
  store,
  render: h => h(App)
}).$mount('#app');
