import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.expo/**', '**/.turbo/**', '**/android/**', '**/ios/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,cjs,mjs}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/test/**'],
    languageOptions: { globals: globals.jest },
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
);