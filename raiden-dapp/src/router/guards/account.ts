import { Route, NavigationGuardNext } from 'vue-router';
import { RouteNames } from '../route-names';

/**
 *  Remembers the route that was visited just before the General view is opened
 *  and then loads the General view in a separate <router-view>. The last
 *  visited route is loaded when clicking out of the General view.
 */
export function beforeRouteToAccount(
  to: Route,
  from: Route,
  next: NavigationGuardNext
): void {
  if (from.name === null) {
    next({ name: RouteNames.HOME });
  } else if (to.matched.length) {
    to.matched[0].components.default = from.matched[0].components.default;
    to.matched[0].components.modal = () => import('@/views/AccountRoute.vue');
  }
  next();
}
