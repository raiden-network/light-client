import { Route, NavigationGuardNext } from 'vue-router';
import { NavigationGuardChild } from './types';

export function globalNavigationGuard(
  this: { children: NavigationGuardChild[] },
  to: Route,
  _from: Route,
  next: NavigationGuardNext
) {
  const routingToRoot = to.fullPath === '/';
  const query = routingToRoot ? {} : { redirectTo: to.fullPath };

  for (const guardChild of this.children) {
    const redirectLocation = guardChild(to);

    if (redirectLocation === null) {
      next();
      return;
    } else if (redirectLocation !== undefined) {
      next({ ...redirectLocation, query });
      return;
    }
  }

  // No guard has caused any navigation -> just continue
  next({});
}
