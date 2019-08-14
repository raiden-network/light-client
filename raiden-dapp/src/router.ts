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
      path: '/payment/:token',
      name: RouteNames.PAYMENT,
      meta: {
        title: 'Send'
      },
      component: () => import('./views/Payment.vue')
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
      name: RouteNames.OPEN_CHANNEL,
      meta: {
        title: 'Open channel'
      },
      component: () => import('./views/OpenChannel.vue')
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
