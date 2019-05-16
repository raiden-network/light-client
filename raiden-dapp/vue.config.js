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
  }
};
