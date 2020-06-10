const path = require('path');

module.exports = {
  entry: './src/index.ts',
  target: 'node',
  mode: 'production',
  // devtool: 'inline-source-map',
  devtool: 'cheap-source-map',
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'bundle.js',
  },
  stats: {
    // Ignore warnings due to yarg's dynamic module loading
    warningsFilter: [/node_modules\/yargs/],
  },
  watchOptions: {
    ignored: ['node_modules'],
  },
  node: {
    // needed to preserve __dirname, used by native-ext-loader
    __dirname: false,
  },
  resolve: {
    extensions: ['.ts', '.js'], //resolve all the modules other than index.ts
    alias: {
      ethers: path.resolve('./node_modules/ethers'),
      wrtc: path.resolve('./node_modules/wrtc'),
    },
  },
  module: {
    rules: [
      {
        use: 'ts-loader',
        test: /\.ts$/,
      },
      {
        test: /\.node$/,
        loader: 'native-ext-loader',
      },
    ],
  },
};
