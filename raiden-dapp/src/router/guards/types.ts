import { Route, Location, NavigationGuardNext } from 'vue-router';

export type GuardArguments = [Route, Route, NavigationGuardNext];

/**
 * The navigation guards next function do also accept `void`. But since `void`
 * can't be returned by a sub-function of the global navigation guard, `null` is
 * used a representation for it. Note that we do not allow to use `false` and
 * `string` here. Also vue-router supports it, we do not.
 */
export type NavigationGuardNextArgument = Location | null;

/**
 * A called by the global navigation guard, that can affect the navigation
 * behavior by its returned routing location. If the guardian child does not
 * return anything (`undefined`), this means that nothing should be changed and
 * the next guard gets checked.
 * Note that a returned location of `void` (or `null`) causes an immediate
 * routing to the already targeting location.
 */
export type NavigationGuardChild = (
  to: Route
) => NavigationGuardNextArgument | undefined;
