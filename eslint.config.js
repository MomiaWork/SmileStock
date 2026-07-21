// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ['dist/*', 'coverage/*'],
  },
  {
    files: ['src/strategy-engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react-native', 'react-native/*', 'expo', 'expo-*', 'expo/*'],
              message: 'strategy-engine must stay platform-independent — no RN/Expo imports.',
            },
          ],
        },
      ],
    },
  },
]);
