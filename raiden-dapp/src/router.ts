/* istanbul ignore file */
import Vue from 'vue';
import Router, { Route } from 'vue-router';
import { Dictionary } from 'vue-router/types/router';

import Home from './views/Home.vue';
import { RouteNames } from '@/route-names';
import store from './store';
import { Tokens } from './types';

Vue.use(Router);

/**
 * Checks whether a token parameter is present and whether
 * requested token network address exists in store.
 */
export const checkTokenNetworkRoute = (
  { token }: Dictionary<string>,
  next: (to?: string | void) => void,
  tokens: Tokens
): void => {
  if (!token) return next();

  return Object.keys(tokens)
    .map(key => tokens[key].address === token)
    .includes(true)
    ? next()
    : next('/');
};

/**
 * Decorator that wraps vue router's `NavigationGuard` and
 * the current list of tokens in the store. This makes testing
 * `checkTokenNetworkRoute` very straight forward.
 */
export const tokenNetworkGuard = (
  { params }: Route,
  _: Route,
  next: (to?: string | void) => void
) => checkTokenNetworkRoute(params, next, store.getters.allTokens);

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
      path: '/payment/:token',
      name: RouteNames.PAYMENT,
      meta: {
        title: 'Send'
      },
      component: () => import('./views/Payment.vue'),
      beforeEnter: tokenNetworkGuard
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
      component: () => import('./views/SelectHub.vue'),
      beforeEnter: tokenNetworkGuard
    },
    {
      path: '/connect/:token/:partner',
      name: RouteNames.OPEN_CHANNEL,
      meta: {
        title: 'Open channel'
      },
      component: () => import('./views/OpenChannel.vue'),
      beforeEnter: tokenNetworkGuard
    },
    {
      path: '/channels/:token',
      name: RouteNames.CHANNELS,
      meta: {
        title: 'Channels'
      },
      component: () => import('./views/Channels.vue'),
      beforeEnter: tokenNetworkGuard
    }
  ]
});

export default router;
