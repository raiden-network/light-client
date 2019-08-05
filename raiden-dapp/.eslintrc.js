module.exports = {
  root: true,
  env: {
    node: true
  },
  plugins: [
    'vuetify'
  ],
  extends: [
    'plugin:vue/recommended',
    'plugin:vue/essential',
    '@vue/prettier',
    '@vue/typescript',
    'plugin:vue-i18n/recommended',
  ],
  rules: {
    'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'vuetify/no-deprecated-classes': 'error',
  },
  parserOptions: {
    parser: '@typescript-eslint/parser'
  },
  settings: {
    'vue-i18n': {
      localeDir: './src/locales/*.json'
    }
  }
};
