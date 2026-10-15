import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // .claude — рабочие копии других отделов (worktrees) со своими незавершёнными файлами; tests/visual/.out — снимки прогона.
  { ignores: ['dist', 'node_modules', 'docs', 'concept', '.claude', 'tests/visual/.out', 'tests/visual/.report'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.strict],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
);
