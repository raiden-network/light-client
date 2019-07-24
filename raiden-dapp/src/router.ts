/* istanbul ignore file */
import Vue from 'vue';
import Router from 'vue-router';
import Home from './views/Home.vue';
import { RouteNames } from '@/route-names';

Vue.use(Router);

export default new Router({
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
      path: '/about',
      name: RouteNames.ABOUT,
      meta: {
        title: 'About'
      },
      // route level code-splitting
      // this generates a separate chunk (about.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () => import('./views/About.vue')
    },
    {
      path: '/transfer/:token',
      name: RouteNames.TRANSFER,
      meta: {
        title: 'Send transaction'
      },
      component: () => import('./views/Transfer.vue')
    },
    {
      path: '/connect',
      name: RouteNames.SELECT_TOKEN,
      meta: {
        title: 'Select token'
      },
      component: () => import('./views/SelectToken.vue')
    },
    {
      path: '/connect/:token',
      name: RouteNames.SELECT_HUB,
      meta: {
        title: 'Select hub'
      },
      component: () => import('./views/SelectHub.vue')
    },
    {
      path: '/connect/:token/:partner',
      name: RouteNames.DEPOSIT,
      meta: {
        title: 'Open channel'
      },
      component: () => import('./views/Deposit.vue')
    },
    {
      path: '/channels/:token',
      name: RouteNames.CHANNELS,
      meta: {
        title: 'Channels'
      },
      component: () => import('./views/Channels.vue')
    }
  ]
});
