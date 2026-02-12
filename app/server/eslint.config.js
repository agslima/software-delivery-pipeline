const js = require('@eslint/js');
const globals = require('globals');
const security = require('eslint-plugin-security');

module.exports = [
  // 1. Base Configuration
  js.configs.recommended,
  security.configs.recommended,

  // 2. Project Specifics
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest, // Enables 'describe', 'it', 'expect'
      },
    },
    rules: {
      'no-console': 'warn',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Security plugin tweak
      'security/detect-object-injection': 'off',
    },
  },
  
  // 3. Ignore Dist/Coverage folders
  {
    ignores: ['coverage/', 'dist/', 'node_modules/'],
  }
];