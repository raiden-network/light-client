const path = require('path');

const CopyWebpackPlugin = require('copy-webpack-plugin');
const VersionFilePlugin = require('webpack-version-file-plugin');
const { DefinePlugin } = require('webpack');
const { InjectManifest } = require('workbox-webpack-plugin');

const sourceDirectoryPath = path.resolve(__dirname, 'src');
const maxAssetSize = 30e6;

function getPackageVersion() {
  const packageInfo = require('./package.json');
  return packageInfo.version ?? '0.0.0';
}

// if service worker not explicitly enabled, disable if not root BASE_URL
if (!process.env.VUE_APP_SERVICE_WORKER_DISABLED && (process.env.BASE_URL ?? '/') !== '/') {
  process.env.VUE_APP_SERVICE_WORKER_DISABLED = 'true';
}

/*
 * Note that it is not necessary to exclude the version file from the to
 * cache assets. The version file gets generated during the build and is
 * thereby not included in the precache entries. The same goes for the
 * worker script itself.
 */
function setupServiceWorkerRelatedPlugins(config) {
  if (process.env.VUE_APP_SERVICE_WORKER_DISABLED === 'true') return;

  const versionFilePlugin = new VersionFilePlugin({
    packageFile: path.join(__dirname, 'package.json'),
    template: path.join(__dirname, 'version.ejs'),
    outputFile: path.join(config.output.path, 'version.json'),
  });

  const versionEnvironmentVariablePlugin = new DefinePlugin({
    'process.env': {
      PACKAGE_VERSION: "'" + getPackageVersion() + "'",
    },
  });

  const injectServiceWorkerPlugin = new InjectManifest({
    swSrc: path.join(sourceDirectoryPath, 'service-worker', 'worker'),
    swDest: 'service-worker.js',
    injectionPoint: 'self.__WB_PRECACHE_ENTRIES',
    maximumFileSizeToCacheInBytes: maxAssetSize,
  });

  config.plugins.push(
    versionFilePlugin,
    versionEnvironmentVariablePlugin,
    injectServiceWorkerPlugin,
  );
}

module.exports = {
  productionSourceMap: false,
  // https://forum.vuejs.org/t/solution-to-building-error-in-circleci-or-any-other-machine-with-cpu-limitations/40862
  parallel: !process.env.CIRCLECI,
  publicPath: process.env.VUE_APP_PUBLIC_PATH ? process.env.VUE_APP_PUBLIC_PATH : '/',
  chainWebpack: (config) => {
    if (process.env.NODE_ENV !== 'production' && !process.env.CI) {
      config.module
        .rule('raiden-source-maps')
        .test(/\.js$/)
        .pre()
        .use('source-map-loader')
        .loader('source-map-loader');
    }
    config.module
      .rule('i18n')
      .resourceQuery(/blockType=i18n/)
      .type('javascript/auto')
      .use('i18n')
      .loader('@kazupon/vue-i18n-loader')
      .end();
  },

  pluginOptions: {
    i18n: {
      locale: 'en',
      fallbackLocale: 'en',
      localeDir: 'locales',
      enableInSFC: true,
    },
  },

  css: {
    extract: {
      ignoreOrder: true,
    },
  },

  // check -> https://github.com/vuejs/vue-cli/issues/2978
  configureWebpack: (config) => {
    config.performance = {
      maxAssetSize,
      maxEntrypointSize: maxAssetSize,
    };

    if (process.env.NODE_ENV === 'development') {
      config.devtool = 'eval-source-map';
      config.output.devtoolFallbackModuleFilenameTemplate = 'webpack:///[resource-path]?[hash]';
      config.output.devtoolModuleFilenameTemplate = (info) => {
        const isVue = info.resourcePath.match(/\.vue$/);
        const isScript = info.query.match(/type=script/);
        const hasModuleId = info.moduleId !== '';

        // Detect generated files, filter as webpack-generated
        if (
          // Must result from vue-loader
          isVue &&
          // Must not be 'script' files (enough for chrome), or must have moduleId (firefox)
          (!isScript || hasModuleId)
        ) {
          let pathParts = info.resourcePath.split('/');
          const baseName = pathParts[pathParts.length - 1];
          // prepend 'generated-' to filename as well, so it's easier to find desired files via Ctrl+P
          pathParts.splice(-1, 1, `generated-${baseName}`);
          return `webpack-generated:///${pathParts.join('/')}?${info.hash}`;
        }
        // If not generated, filter as webpack-vue
        return `webpack-vue:///${info.resourcePath}`;
      };
    }

    const patterns = [];

    if (process.env.DEPLOYMENT_INFO && process.env.DEPLOYMENT_SERVICES_INFO) {
      patterns.push(
        {
          from: path.resolve(process.env.DEPLOYMENT_INFO),
          to: config.output.path,
        },
        {
          from: path.resolve(process.env.DEPLOYMENT_SERVICES_INFO),
          to: config.output.path,
        },
      );
    }

    if (patterns.length > 0) {
      config.plugins.push(
        new CopyWebpackPlugin({
          patterns: patterns,
        }),
      );
    }

    setupServiceWorkerRelatedPlugins(config);
  },
};
