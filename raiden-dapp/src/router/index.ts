import Vue from 'vue';
import Router from 'vue-router';

import {
  globalNavigationGuard,
  redirectIfDisclaimerIsNotAccepted,
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
    children: [redirectIfDisclaimerIsNotAccepted, redirectIfNotConnected],
  }),
);

export default router;
