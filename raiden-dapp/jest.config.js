module.exports = {
  setupFiles: ['./jest.setup.js', 'jest-canvas-mock'],
  setupFilesAfterEnv: ['./jest.setup-after.ts'],
  moduleFileExtensions: ['js', 'jsx', 'json', 'vue', 'ts', 'tsx', 'node'],
  transform: {
    '^.+\\.vue$': '@vue/vue2-jest',
    '.+\\.(css|styl|less|sass|scss|svg|png|jpg|ttf|woff|woff2)$': 'jest-transform-stub',
    '^.+\\.tsx?$': 'ts-jest',
    '^.+\\.jsx?$': 'babel-jest',
  },
  testEnvironment: 'jsdom',
  transformIgnorePatterns: ['<rootDir>/node_modules/(?!workbox.*/.*)'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  snapshotSerializers: ['jest-serializer-vue'],
  testMatch: ['**/tests/unit/**/*.spec.(js|jsx|ts|tsx)|**/__tests__/*.(js|jsx|ts|tsx)'],
  testURL: 'http://localhost/',
  globals: {
    'ts-jest': {
      babelConfig: true,
    },
  },
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.{ts,vue}', '!**/node_modules/**', '!**/vendor/**'],
  coverageReporters: ['html', 'lcov', 'text-summary'],
  reporters: ['default', 'jest-junit'],
};
