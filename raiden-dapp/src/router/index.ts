import { parse } from 'query-string';
import Vue from 'vue';
import Router from 'vue-router';

import store from '@/store';

import {
  globalNavigationGuard,
  redirectIfDisclaimerIsNotAccepted,
  redirectIfNoConnectedToken,
  redirectIfNotConnected,
} from './guards';
import { routes } from './routes';

Vue.use(Router);

/**
 * In 'hash' mode, the router expects the URL search (query) string to be
 * within the hash of the URL (e.g. `http://test.tld/#/route?foo=bar`).
 * This does not align with the W3C standard. There everything after a not
 * encoded '#' belongs to the hash. The search string gets placed before the
 * hash. As a result, anyone who creates a link for the dApp probably ends up
 * with `https://test.tld/?foo=bar#route`. Unfortunately this does not get
 * properly parsed by the routers default `parseQuery` function.
 * As a solution this custom function parses both search/query strings and
 * merges both.
 *
 * @param queryString - from the hash part of the URL by the router
 * @returns parsed query parameter in object representation
 */
function parseQuery(queryString: string): { [key: string]: unknown } {
  const search = parse(window.location.search);
  const query = parse(queryString);
  return { ...search, ...query };
}

const router = new Router({
  base: process.env.BASE_URL,
  mode: 'hash',
  parseQuery,
  routes,
});

router.beforeEach(
  globalNavigationGuard.bind({
    store,
    children: [
      redirectIfDisclaimerIsNotAccepted,
      redirectIfNotConnected,
      redirectIfNoConnectedToken,
    ],
  }),
);

export default router;
