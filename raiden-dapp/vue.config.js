const path = require('path');

module.exports = {
  chainWebpack: config => {
    if (process.env.NODE_ENV !== 'production' && !process.env.CI) {
      config.module
        .rule('raiden-source-maps')
        .test(/\.js$/)
        .pre()
        .use('source-map-loader')
        .loader('source-map-loader');

      config.devtool = 'eval-source-map';
    }
    config.module
      .rule('i18n')
      .resourceQuery(/blockType=i18n/)
      .type('javascript/auto')
      .use('i18n')
      .loader('@kazupon/vue-i18n-loader')
      .end();
    config.resolve.alias.set(
      'ethers',
      path.resolve(__dirname, 'node_modules/ethers')
    );
  },

  pluginOptions: {
    i18n: {
      locale: 'en',
      fallbackLocale: 'en',
      localeDir: 'locales',
      enableInSFC: true
    }
  }
};
