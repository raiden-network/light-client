/**
 * Adds a wrapping `div data-app="true"` to the body so that we don't
 * get Vuetify complaining about missing data-app attribute for some components.
 *
 * @return undefined
 */
export function addElemWithDataAppToBody() {
  const app = document.createElement('div');
  app.setAttribute('data-app', 'true');
  document.body.append(app);
}
