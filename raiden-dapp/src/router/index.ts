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
      component: () => import('../views/Transfer.vue')
    },
    {
      path: '/transfer/:token/:target',
      name: RouteNames.TRANSFER_STEPS,
      meta: {
        title: 'Transfer'
      },
      component: () => import('../views/TransferSteps.vue')
    },
    {
      path: '/connect',
      name: RouteNames.SELECT_TOKEN,
      meta: {
        title: 'Select Token'
      },
      component: () => import('../views/SelectToken.vue')
    },
    {
      path: '/connect/:token',
      name: RouteNames.SELECT_HUB,
      meta: {
        title: 'Select Hub'
      },
      component: () => import('../views/SelectHub.vue')
    },
    {
      path: '/connect/:token/:partner',
      name: RouteNames.OPEN_CHANNEL,
      meta: {
        title: 'Open Channel'
      },
      component: () => import('../views/OpenChannel.vue')
    },
    {
      path: '/channels/:token',
      name: RouteNames.CHANNELS,
      meta: {
        title: 'Channels'
      },
      component: () => import('../views/Channels.vue')
    },
    {
      path: '/general',
      name: RouteNames.GENERAL,
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
            import('../views/GeneralDialog.vue');
        }
        next();
      },
      children: [
        {
          path: 'general-home',
          name: RouteNames.GENERAL_HOME,
          meta: {
            title: 'General'
          },
          component: () => import('../views/GeneralHome.vue')
        },
        {
          path: 'backup-state',
          name: RouteNames.BACKUP_STATE,
          meta: {
            title: 'Backup State'
          },
          component: () => import('../views/BackupState.vue')
        },
        {
          path: 'raiden-account',
          name: RouteNames.RAIDEN_ACCOUNT,
          meta: {
            title: 'Raiden Account'
          },
          component: () => import('../views/RaidenAccount.vue')
        }
      ]
    }
  ]
});

export default router;
