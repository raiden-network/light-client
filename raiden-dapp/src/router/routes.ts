import { RouteConfig } from 'vue-router';
import { RouteNames } from './route-names';
import { beforeRouteToNotifications, beforeRouteToAccount } from './guards';
import DisclaimerRoute from '@/views/DisclaimerRoute.vue';
import Home from '@/views/Home.vue';

/* istanbul ignore next */
export const routes: RouteConfig[] = [
  {
    path: '/',
    name: RouteNames.DISCLAIMER,
    meta: {
      title: 'Disclaimer',
    },
    component: DisclaimerRoute,
  },
  {
    path: '*',
    redirect: '/',
  },
  {
    path: '/home',
    name: RouteNames.HOME,
    meta: {
      title: 'Raiden dApp',
    },
    component: Home,
  },
  {
    path: '/transfer/:token?',
    name: RouteNames.TRANSFER,
    meta: {
      title: 'Transfer',
    },
    component: () => import('../views/TransferRoute.vue'),
  },
  {
    path: '/transfer/:token/:target',
    name: RouteNames.TRANSFER_STEPS,
    meta: {
      title: 'Transfer',
    },
    component: () => import('../views/TransferStepsRoute.vue'),
  },
  {
    path: '/connect',
    name: RouteNames.SELECT_TOKEN,
    meta: {
      title: 'Select Token',
    },
    component: () => import('../views/SelectTokenRoute.vue'),
  },
  {
    path: '/connect/:token',
    name: RouteNames.SELECT_HUB,
    meta: {
      title: 'Select Hub',
    },
    component: () => import('../views/SelectHubRoute.vue'),
  },
  {
    path: '/connect/:token/:partner',
    name: RouteNames.OPEN_CHANNEL,
    meta: {
      title: 'Open Channel',
    },
    component: () => import('../views/OpenChannelRoute.vue'),
  },
  {
    path: '/channels/:token',
    name: RouteNames.CHANNELS,
    meta: {
      title: 'Channels',
    },
    component: () => import('../views/ChannelsRoute.vue'),
  },
  {
    path: '/notifications',
    name: RouteNames.NOTIFICATIONS,
    beforeEnter: beforeRouteToNotifications,
  },
  {
    path: '/account',
    beforeEnter: beforeRouteToAccount,
    children: [
      {
        path: '/',
        name: RouteNames.ACCOUNT_ROOT,
        meta: {
          title: 'Account',
        },
        component: () => import('../views/account/AccountRoot.vue'),
      },
      {
        path: 'backup',
        name: RouteNames.ACCOUNT_BACKUP,
        meta: {
          title: 'Backup State',
        },
        component: () => import('../views/account/BackupState.vue'),
      },
      {
        path: 'raiden',
        name: RouteNames.ACCOUNT_RAIDEN,
        meta: {
          title: 'Raiden Account',
        },
        component: () => import('../views/account/RaidenAccount.vue'),
      },
      {
        path: 'settings',
        name: RouteNames.ACCOUNT_SETTINGS,
        meta: {
          title: 'Settings',
        },
        component: () => import('../views/account/Settings.vue'),
      },
      {
        path: 'withdrawal',
        name: RouteNames.ACCOUNT_WITHDRAWAL,
        meta: {
          title: 'Withdrawal',
        },
        component: () => import('../views/account/WithdrawalRoute.vue'),
      },
      {
        path: 'udc',
        name: RouteNames.ACCOUNT_UDC,
        meta: {
          title: 'UDC',
        },
        component: () => import('../views/account/UDC.vue'),
      },
    ],
  },
];
