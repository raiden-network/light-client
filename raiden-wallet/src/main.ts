import Vue from 'vue';
import './plugins/vuetify';
import App from './App.vue';
import router from './router';
import store from './store';
import './registerServiceWorker';
import { Web3Plugin } from '@/plugins/web3';

Vue.config.productionTip = false;

Vue.use(Web3Plugin);

new Vue({
  router,
  store,
  render: h => h(App)
}).$mount('#app');
