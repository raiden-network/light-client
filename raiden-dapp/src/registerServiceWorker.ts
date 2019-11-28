/* eslint-disable no-console */
/* istanbul ignore file */

import { register } from 'register-service-worker';

if (
  process.env.NODE_ENV === 'production' &&
  !process.env.VUE_APP_RAIDEN_PACKAGE
) {
  register(`${process.env.BASE_URL}service-worker.js`, {
    ready() {
      console.log(
        'App is being served from cache by a service worker.\n' +
          'For more details, visit https://goo.gl/AFskqB'
      );
    },
    registered(registration: ServiceWorkerRegistration) {
      setInterval(() => {
        registration.update();
      }, 1000);
      console.log('Service worker has been registered.');
    },
    cached() {
      console.log('Content has been cached for offline use.');
    },
    updatefound() {
      console.log('New content is downloading.');
    },
    updated(registration: ServiceWorkerRegistration) {
      document.dispatchEvent(
        new CustomEvent('swUpdated', { detail: registration })
      );
      console.log('New content is available; please refresh.');
    },
    offline() {
      console.log(
        'No internet connection found. App is running in offline mode.'
      );
    },
    error(error) {
      console.error('Error during service worker registration:', error);
    }
  });
}
