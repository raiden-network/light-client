/* istanbul ignore file */
import '@mdi/font/css/materialdesignicons.css';
import Vue from 'vue';
import Vuetify from 'vuetify/lib';

Vue.use(Vuetify);

export default new Vuetify({
  icons: {
    iconfont: 'mdi'
  },
  theme: {
    dark: true,
    themes: {
      dark: {
        primary: '#28A5C8',
        secondary: '#0A6E87'
      }
    }
  }
});
