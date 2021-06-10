import Vue from 'vue';
import Router from 'vue-router';

import store from '@/store';

import {
  globalNavigationGuard,
  redirectIfDisclaimerIsNotAccepted,
  redirectIfNoConnectedToken,
  redirectIfNotConnected,
} from './guards';
import { routes } from './routes';

Vue.use(Router);

const router = new Router({
  base: process.env.BASE_URL,
  mode: 'hash',
  routes,
});

router.beforeEach(
  globalNavigationGuard.bind({
    store,
    children: [
      redirectIfDisclaimerIsNotAccepted,
      redirectIfNotConnected,
      redirectIfNoConnectedToken,
    ],
  }),
);

export default router;
