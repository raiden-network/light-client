/* istanbul ignore file */
import Vue from 'vue';
import Router from 'vue-router';
import Home from './views/Home.vue';

Vue.use(Router);

export default new Router({
  mode: 'history',
  base: process.env.BASE_URL,
  routes: [
    {
      path: '/',
      name: 'home',
      component: Home
    },
    {
      path: '*',
      redirect: '/'
    },
    {
      path: '/about',
      name: 'about',
      // route level code-splitting
      // this generates a separate chunk (about.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () => import('./views/About.vue')
    },
    {
      path: '/send/:token/:partner',
      name: 'send',
      component: () => import('./views/SelectTarget.vue')
    },
    {
      path: '/connect/:token?/:partner?',
      name: 'connect',
      component: () => import('./views/Connect.vue')
    },
    {
      path: '/channels/:token',
      name: 'channels',
      component: () => import('./views/Channels.vue')
    }
  ]
});
