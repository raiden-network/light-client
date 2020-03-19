/* istanbul ignore file */
import Vue from 'vue';
import Router from 'vue-router';

import Home from '../views/Home.vue';
import { RouteNames } from '@/router/route-names';

Vue.use(Router);

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
      path: '/scan',
      name: RouteNames.SCAN,
      meta: {
        title: 'Scan'
      },
      component: () => import('../views/Scan.vue')
    }
  ]
});

export default router;
