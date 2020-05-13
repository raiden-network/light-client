import Vue from 'vue';
import Router from 'vue-router';

import Home from '../views/Home.vue';
import { RouteNames } from '@/router/route-names';

Vue.use(Router);

/* istanbul ignore next */
const router = new Router({
  mode: 'history',
  base: process.env.BASE_URL,
  routes: [
    {
      path: '/',
      name: RouteNames.HOME,
      meta: {
        title: 'Raiden dApp'
      },
      component: Home
    },
    {
      path: '*',
      redirect: '/'
    },
    {
      path: '/transfer/:token',
      name: RouteNames.TRANSFER,
      meta: {
        title: 'Transfer'
      },
      component: () => import('../views/TransferRoute.vue')
    },
    {
      path: '/transfer/:token/:target',
      name: RouteNames.TRANSFER_STEPS,
      meta: {
        title: 'Transfer'
      },
      component: () => import('../views/TransferStepsRoute.vue')
    },
    {
      path: '/connect',
      name: RouteNames.SELECT_TOKEN,
      meta: {
        title: 'Select Token'
      },
      component: () => import('../views/SelectTokenRoute.vue')
    },
    {
      path: '/connect/:token',
      name: RouteNames.SELECT_HUB,
      meta: {
        title: 'Select Hub'
      },
      component: () => import('../views/SelectHubRoute.vue')
    },
    {
      path: '/connect/:token/:partner',
      name: RouteNames.OPEN_CHANNEL,
      meta: {
        title: 'Open Channel'
      },
      component: () => import('../views/OpenChannelRoute.vue')
    },
    {
      path: '/channels/:token',
      name: RouteNames.CHANNELS,
      meta: {
        title: 'Channels'
      },
      component: () => import('../views/ChannelsRoute.vue')
    },
    {
      path: '/account',
      name: RouteNames.ACCOUNT,
      beforeEnter: (to, from, next) => {
        // Remembers the route that was visited just before the General view is opened and
        // then loads the General view in a separate <router-view>. The last visited route
        // is loaded when clicking out of the General view.
        if (from.name === null) {
          next({
            name: RouteNames.HOME
          });
        } else if (to.matched.length) {
          to.matched[0].components.default = from.matched[0].components.default;
          to.matched[0].components.modal = () =>
            import('../views/AccountRoute.vue');
        }
        next();
      },
      children: [
        {
          path: '/',
          name: RouteNames.ACCOUNT_ROOT,
          meta: {
            title: 'Account'
          },
          component: () => import('../views/account/AccountRoot.vue')
        },
        {
          path: 'backup',
          name: RouteNames.ACCOUNT_BACKUP,
          meta: {
            title: 'Backup State'
          },
          component: () => import('../views/account/BackupState.vue')
        },
        {
          path: 'raiden',
          name: RouteNames.ACCOUNT_RAIDEN,
          meta: {
            title: 'Raiden Account'
          },
          component: () => import('../views/account/RaidenAccount.vue')
        },
        {
          path: 'settings',
          name: RouteNames.ACCOUNT_SETTINGS,
          meta: {
            title: 'Settings'
          },
          component: () => import('../views/account/Settings.vue')
        },
        {
          path: 'withdrawal',
          name: RouteNames.ACCOUNT_WITHDRAWAL,
          meta: {
            title: 'Withdrawal'
          },
          component: () => import('../views/account/WithdrawalRoute.vue')
        }
      ]
    }
  ]
});

export default router;
