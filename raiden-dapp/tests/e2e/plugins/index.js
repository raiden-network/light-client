const path = require('path');

const webpackPreprocessor = require('@cypress/webpack-preprocessor');

const preprocessingOptions = {
  webpackOptions: {
    resolve: {
      extensions: ['.ts', '.tsx', '.js'],
      // add the alias object
      alias: {
        '@': path.resolve(__dirname, '../../../src'),
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
};

function setBrowserOptionsForCleanEnvironment(browser = {}, launchOptions) {
  if (browser.family === 'chromium') {
    launchOptions.args.push('--incognito');
    launchOptions.args.push('--auto-open-devtools-for-tabs');
    launchOptions.args.push(`--user-data-dir=/tmp/${Date.now()}`);
  }

  return launchOptions;
}

module.exports = (on, config) => {
  require('@cypress/code-coverage/task')(on, config);

  on('file:preprocessor', webpackPreprocessor(preprocessingOptions));
  on('before:browser:launch', setBrowserOptionsForCleanEnvironment);

  // Only allow Chromium based browser to make sure the set launch options work.
  config.browsers = config.browsers.filter((browser) => browser.family === 'chromium');

  return Object.assign({}, config);
};
