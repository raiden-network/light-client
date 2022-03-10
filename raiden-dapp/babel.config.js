const plugins = [
  '@babel/plugin-proposal-nullish-coalescing-operator',
  '@babel/plugin-proposal-optional-chaining',
  '@babel/plugin-proposal-class-static-block',
];

if (process.env.E2E) {
  plugins.push('istanbul');
}

module.exports = {
  presets: [
    ['@vue/cli-plugin-babel/preset', { useBuiltIns: 'entry' }],
    '@babel/preset-typescript',
  ],
  plugins: plugins,
};
