/* eslint-disable @typescript-eslint/no-var-requires */
import { defineConfig } from 'cypress';
import path from 'path';

export default defineConfig({
  reporter: 'junit',
  reporterOptions: {
    mochaFile: 'tests/e2e/results/reports/summary.xml',
  },
  screenshotsFolder: 'tests/e2e/results/screenshots',
  videosFolder: 'tests/e2e/results/videos',
  downloadsFolder: 'tests/e2e/results/downloads',
  fixturesFolder: 'tests/e2e/fixtures',
  // modifyObstructiveCode: false,
  videoUploadOnPasses: false,
  chromeWebSecurity: false,
  defaultCommandTimeout: 5000,
  e2e: {
    setupNodeEvents(on, config) {
      require('@cypress/code-coverage/task')(on, config);

      on(
        'file:preprocessor',
        require('@cypress/webpack-preprocessor')({
          webpackOptions: {
            resolve: {
              extensions: ['.ts', '.tsx', '.js'],
              // add the alias object
              alias: {
                '@': path.resolve(__dirname, 'src'),
              },
            },
            module: {
              rules: [
                {
                  // Include ts, tsx, js, and jsx files.
                  test: /\.(ts|js)x?$/,
                  exclude: /node_modules/,
                  loader: 'babel-loader',
                },
                {
                  test: /\.js$/,
                  use: ['source-map-loader'],
                  enforce: 'pre',
                },
              ],
            },
          },
        }),
      );
      on(
        'before:browser:launch',
        function setBrowserOptionsForCleanEnvironment(browser, launchOptions) {
          if (browser.family === 'chromium') {
            launchOptions.args.push('--incognito');
            launchOptions.args.push('--auto-open-devtools-for-tabs');
            launchOptions.args.push(`--user-data-dir=/tmp/${Date.now()}`);
          }

          return launchOptions;
        },
      );

      // Only allow Chromium based browser to make sure the set launch options work.
      config.browsers = config.browsers.filter((browser) => browser.family === 'chromium');

      return Object.assign({}, config);
    },
    specPattern: 'tests/e2e/specs/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'tests/e2e/support/index.ts',
    baseUrl: 'http://localhost:5000',
  },
});
