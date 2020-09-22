import Vue from 'vue';
import Router from 'vue-router';
import { routes } from './routes';
import {
  globalNavigationGuard,
  redirectIfDisclaimerIsNotAccepted,
  redirectIfNotConnected,
} from './guards';

Vue.use(Router);

const router = new Router({
  base: process.env.BASE_URL,
  mode: 'hash',
  routes,
});

router.beforeEach(
  globalNavigationGuard.bind({
    children: [redirectIfDisclaimerIsNotAccepted, redirectIfNotConnected],
  })
);

export default router;
