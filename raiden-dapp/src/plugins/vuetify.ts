/* istanbul ignore file */
import '@mdi/font/css/materialdesignicons.css';
import 'material-design-icons-iconfont/dist/material-design-icons.css';
import 'typeface-roboto/index.css';
import Vue from 'vue';
import Vuetify from 'vuetify/lib';

Vue.use(Vuetify);

export default new Vuetify({
  icons: {
    iconfont: 'mdi',
  },
  theme: {
    dark: true,
    themes: {
      dark: {
        notification: '#ea6464',
        primary: '#28A5C8',
        secondary: '#0A6E87',
        pending: '#fdd327',
        success: '#1dc512',
        failed: '#ea6464',
      },
    },
  },
});
