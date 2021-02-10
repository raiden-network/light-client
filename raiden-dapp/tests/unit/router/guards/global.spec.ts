import type { NavigationGuardNext, Route } from 'vue-router';

import type { GuardArguments } from '@/router/guards';
import { globalNavigationGuard } from '@/router/guards';

const anyRoute = {
  path: '/',
  hash: '',
  query: {},
  params: {},
  fullPath: '/',
  matched: [],
} as Route;

const next: NavigationGuardNext = jest.fn();
const staticGuardArguments: GuardArguments = [anyRoute, anyRoute, next];
const emptyChildGuard = (_to: Route) => undefined;
const fastForwardChildGuard = (_to: Route) => null;
const firstChildGuard = (_to: Route) => ({ name: 'first-route' });
const secondChildGuard = (_to: Route) => ({ name: 'second-route' });

describe('globalNavigationGuard()', () => {
  beforeEach(() => {
    (next as jest.Mock).mockClear();
  });

  test('do not redirect if there are no child guards', () => {
    globalNavigationGuard.apply({ children: [] }, staticGuardArguments);
    expect(next).toHaveBeenCalledWith({});
  });

  test('do not redirect if child guard returns nothing', () => {
    globalNavigationGuard.apply({ children: [emptyChildGuard] }, staticGuardArguments);
    expect(next).toHaveBeenCalledWith({});
  });

  test('directly navigate to current location if guard returns null', async () => {
    globalNavigationGuard.apply({ children: [fastForwardChildGuard] }, staticGuardArguments);
    expect(next).toHaveBeenCalledWith();
  });

  test('redirect to location child guard returns', async () => {
    globalNavigationGuard.apply({ children: [firstChildGuard] }, staticGuardArguments);
    expect(next).toHaveBeenCalledWith({ name: 'first-route' });
  });

  test('ignore second child guard if first returns location', async () => {
    globalNavigationGuard.apply(
      { children: [firstChildGuard, secondChildGuard] },
      staticGuardArguments,
    );
    expect(next).toHaveBeenCalledWith({ name: 'first-route' });
  });

  test('redirect to second child guards location if first returns nothing', async () => {
    globalNavigationGuard.apply(
      { children: [emptyChildGuard, secondChildGuard] },
      staticGuardArguments,
    );
    expect(next).toHaveBeenCalledWith({ name: 'second-route' });
  });
});
