const path = require('path');

module.exports = {
  root: true,
  env: {
    node: true,
  },
  plugins: [
    'vuetify',
  ],
  extends: [
    'plugin:vue/recommended',
    'plugin:vue/essential',
    '@vue/prettier',
    '@vue/typescript',
    'plugin:vue-i18n/recommended',
    'plugin:import/errors',
    'plugin:import/warnings',
    'plugin:import/typescript'
  ],
  rules: {
    'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'vuetify/no-deprecated-classes': 'error',
    'vuetify/grid-unknown-attributes': 'error',
    'vuetify/no-legacy-grid': 'error',
    'vue/multiline-html-element-content-newline': ['error', {
      'ignoreWhenEmpty': true,
      'ignores': ['pre', 'textarea'],
      'allowEmptyLines': false
    }],
    'vue/v-bind-style': ['error', 'shorthand'],
    'vue/v-on-style': ['error', 'shorthand'],
    'vue-i18n/no-raw-text': [process.env.NODE_ENV === 'production' ? 'error' : 'warn', {
      'ignoreNodes': ['v-icon'],
    }],
    '@typescript-eslint/no-unused-vars': ['error', {
      'vars': 'all',
      'args': 'after-used',
      'ignoreRestSiblings': false,
      'argsIgnorePattern': '^_'
    }],
    'vue/v-slot-style': [
      'error',
      {
        atComponent: 'shorthand',
        default: 'shorthand',
        named: 'shorthand'
      }
    ],
    'vue-i18n/no-unused-keys': ['error', {
      'src': './src',
      'extensions': ['.ts', '.vue']
    }],
    "vue/component-name-in-template-casing": ["error", "kebab-case", {
      "registeredComponentsOnly": false,
      "ignores": []
    }]
  },
  parserOptions: {
    parser: '@typescript-eslint/parser',
  },
  settings: {
    'vue-i18n': {
      localeDir: './src/locales/*.json',
    },
    'import/resolver': {
      alias: {
        map: [
          ['@', path.resolve('src')],
        ],
        extensions: ['.vue', '.ts', '.d.ts']
      }
    }
  },
};
