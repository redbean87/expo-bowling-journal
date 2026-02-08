module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  env: {
    'react-native/react-native': true,
    es2021: true,
    node: true,
  },
  plugins: [
    '@typescript-eslint',
    'react',
    'react-hooks',
    'react-native',
    'import',
    'unused-imports',
    'prettier',
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:react-native/all',
    'plugin:prettier/recommended',
  ],
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    // React
    'react/react-in-jsx-scope': 'off', // Not needed in React 17+
    'react/prop-types': 'off', // Using TypeScript for prop validation

    // React Native
    'react-native/no-color-literals': 'off',
    'react-native/no-inline-styles': 'off',
    'react-native/no-raw-text': 'off', // Too strict for most cases
    'react-native/sort-styles': 'off', // Personal preference
    'react-native/no-unused-styles': 'off', // Has false positives with dynamic styles

    // TypeScript
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-empty-object-type': 'off',
    '@typescript-eslint/no-require-imports': 'off', // Expo uses require for assets

    // Unused imports
    'unused-imports/no-unused-imports': 'error',

    // Import ordering
    'import/order': [
      'error',
      {
        groups: [
          'builtin', // Node.js built-ins
          'external', // npm packages
          'internal', // internal imports (if configured)
          ['parent', 'sibling'], // relative imports
          'index', // index imports
          'type', // type imports
        ],
        'newlines-between': 'always',
        alphabetize: {
          order: 'asc',
          caseInsensitive: true,
        },
      },
    ],

    // Prettier
    'prettier/prettier': 'error',
  },
  ignorePatterns: [
    'node_modules/',
    '.expo/',
    'dist/',
    'build/',
    'metro.config.js',
    'babel.config.js',
  ],
};
