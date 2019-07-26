/* istanbul ignore file */
import Vue from 'vue';
import '@/plugins/vuetify';
import '@/plugins/class-component.hooks';
import '@/filters';
import App from './App.vue';
import router from './router';
import store from './store';
import './registerServiceWorker';
import './class-component-hooks';
import { RaidenPlugin } from '@/plugins/raiden';
import { IdenticonPlugin } from '@/plugins/identicon-plugin';
import i18n from './i18n';

Vue.config.productionTip = false;

Vue.use(RaidenPlugin);
Vue.use(IdenticonPlugin);

new Vue({
  router,
  store,

  created() {
    if (sessionStorage.redirect) {
      const redirect = sessionStorage.redirect;
      delete sessionStorage.redirect;
      this.$router.push(redirect);
    }
  },

  i18n,
  render: h => h(App)
}).$mount('#app');
