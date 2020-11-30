import { RouteConfig } from 'vue-router';
import { beforeRouteToNotifications, beforeRouteToAccount } from './guards';
import { RouteNames } from './route-names';
import DisclaimerRoute from '@/views/DisclaimerRoute.vue';
import Home from '@/views/Home.vue';

/* istanbul ignore next */
export const routes: RouteConfig[] = [
  {
    path: '/',
    name: RouteNames.DISCLAIMER,
    meta: {
      title: 'Disclaimer',
      cannotNavigateBack: true,
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
      cannotNavigateBack: true,
    },
    component: Home,
  },
  {
    path: '/transfer/:token?',
    name: RouteNames.TRANSFER,
    meta: {
      title: 'Transfer',
      cannotNavigateBack: true,
      infoOverlay: {
        headerImage: 'transfer_info.svg',
        header: 'info-overlay.transfer.header',
        body: 'info-overlay.transfer.body',
      },
    },
    component: () => import('../views/TransferRoute.vue'),
  },
  {
    path: '/transfer/:token/:target',
    name: RouteNames.TRANSFER_STEPS,
    meta: {
      title: 'Transfer',
      infoOverlay: {
        headerImage: 'transfer_steps_info.svg',
        header: 'info-overlay.transfer-steps.header',
        body: 'info-overlay.transfer-steps.body',
      },
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
      infoOverlay: {
        headerImage: 'select_hub_info.svg',
        header: 'info-overlay.select-hub.header',
        body: 'info-overlay.select-hub.body',
      },
    },
    component: () => import('../views/SelectHubRoute.vue'),
  },
  {
    path: '/connect/:token/:partner',
    name: RouteNames.OPEN_CHANNEL,
    meta: {
      title: 'Open Channel',
      infoOverlay: {
        headerImage: 'open_channel_info.svg',
        header: 'info-overlay.open-channel.header',
        body: 'info-overlay.open-channel.body',
      },
    },
    component: () => import('../views/OpenChannelRoute.vue'),
  },
  {
    path: '/channels/:token',
    name: RouteNames.CHANNELS,
    meta: {
      title: 'Channels',
      infoOverlay: {
        headerImage: 'channels_info.svg',
        header: 'info-overlay.channels.header',
        body: 'info-overlay.channels.body',
      },
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
          infoOverlay: {
            headerImage: 'backup_state_info.svg',
            header: 'info-overlay.account-backup.header',
            body: 'info-overlay.account-backup.body',
          },
        },
        component: () => import('../views/account/BackupState.vue'),
      },
      {
        path: 'raiden',
        name: RouteNames.ACCOUNT_RAIDEN,
        meta: {
          title: 'Raiden Account',
          infoOverlay: {
            headerImage: 'transfer_eth_info.svg',
            header: 'info-overlay.account-raiden.header',
            body: 'info-overlay.account-raiden.body',
          },
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
          infoOverlay: {
            headerImage: 'withdraw_tokens_info.svg',
            header: 'info-overlay.account-withdrawal.header',
            body: 'info-overlay.account-withdrawal.body',
          },
        },
        component: () => import('../views/account/WithdrawalRoute.vue'),
      },
      {
        path: 'udc',
        name: RouteNames.ACCOUNT_UDC,
        meta: {
          title: 'UDC',
          infoOverlay: {
            headerImage: 'udc_info.svg',
            header: 'info-overlay.account-udc.header',
            body: 'info-overlay.account-udc.body',
          },
        },
        component: () => import('../views/account/UDC.vue'),
      },
    ],
  },
];
