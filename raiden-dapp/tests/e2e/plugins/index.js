const path = require('path');
const wp = require('@cypress/webpack-preprocessor');

/* eslint-disable arrow-body-style */
// https://docs.cypress.io/guides/guides/plugins-guide.html

// if you need a custom webpack configuration you can uncomment the following import
// and then use the `file:preprocessor` event
// as explained in the cypress docs
// https://docs.cypress.io/api/plugins/preprocessors-api.html#Examples

// /* eslint-disable import/no-extraneous-dependencies, global-require */
// const webpack = require('@cypress/webpack-preprocessor')

module.exports = (on, config) => {
  require('@cypress/code-coverage/task')(on, config);
  const options = {
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
  on('file:preprocessor', wp(options));

  return Object.assign({}, config);
};
