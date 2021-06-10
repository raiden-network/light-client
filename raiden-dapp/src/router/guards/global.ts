import type { NavigationGuardNext, Route } from 'vue-router';
import type { Store } from 'vuex';

import type { CombinedStoreState } from '@/store';

import type { NavigationGuardChild } from './types';

/**
 * @param this - bound function conext
 * @param this.children - list of navigation guard children
 * @param this.store - store to read state data from
 * @param to - navigation target
 * @param _from - navigation origin (ignored)
 * @param next - middleware function
 */
export function globalNavigationGuard(
  this: { store: Store<CombinedStoreState>; children: NavigationGuardChild[] },
  to: Route,
  _from: Route,
  next: NavigationGuardNext,
) {
  for (const guardChild of this.children) {
    const redirectLocation = guardChild(to, this.store);

    if (redirectLocation === null) {
      next();
      return;
    } else if (redirectLocation !== undefined) {
      next(redirectLocation);
      return;
    }
  }

  // No guard has caused any navigation -> just continue
  next({});
}
