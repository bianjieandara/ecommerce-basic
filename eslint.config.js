// ESLint flat config: TypeScript and Astro linting, plus the hexagonal layer boundaries
// described in docs/ARCHITECTURE.md. A forbidden import is a lint error, not a convention.
import eslintPluginAstro from 'eslint-plugin-astro';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/** Module patterns that the domain layer must never import. */
const DOMAIN_FORBIDDEN = [
  '@/application',
  '@/application/**',
  '@/infrastructure',
  '@/infrastructure/**',
  '@/http',
  '@/http/**',
  '@/ui',
  '@/ui/**',
  '@/composition',
  '@/composition/**',
  'astro',
  'astro/**',
  'astro:*',
  'cloudflare:*',
  'preact',
  'preact/**',
  'stripe',
  'zod',
];

/** Module patterns that the application layer must never import. `zod` and `micromark` are allowed here. */
const APPLICATION_FORBIDDEN = [
  '@/infrastructure',
  '@/infrastructure/**',
  '@/http',
  '@/http/**',
  '@/ui',
  '@/ui/**',
  '@/composition',
  '@/composition/**',
  'astro',
  'astro/**',
  'astro:*',
  'cloudflare:*',
  'preact',
  'preact/**',
  'stripe',
];

/** Module patterns that infrastructure must never import (it implements ports, it does not drive HTTP or UI). */
const INFRASTRUCTURE_FORBIDDEN = [
  '@/http',
  '@/http/**',
  '@/ui',
  '@/ui/**',
  '@/composition',
  '@/composition/**',
];

/** Module patterns for the driving/presentation side: UI, pages and client extensions use ports, never adapters. */
const PRESENTATION_FORBIDDEN = [
  '@/infrastructure',
  '@/infrastructure/**',
  '@/composition',
  '@/composition/**',
];

/**
 * Builds a `no-restricted-imports` rule for one layer.
 * @param {string[]} patterns Module patterns that are forbidden for the layer.
 */
const boundary = (patterns) => [
  'error',
  {
    patterns: [
      {
        group: patterns,
        message: 'Layer boundary violation: see docs/ARCHITECTURE.md (dependency rule).',
      },
    ],
  },
];

export default [
  {
    ignores: ['dist', '.astro', '.wrangler', 'node_modules', 'worker-configuration.d.ts', 'wrangler.jsonc'],
  },
  ...tseslint.configs.recommended,
  ...eslintPluginAstro.configs.recommended,
  {
    files: ['**/*.{js,mjs,ts,tsx,astro}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: { 'no-restricted-imports': boundary(DOMAIN_FORBIDDEN) },
  },
  {
    files: ['src/application/**/*.ts'],
    rules: { 'no-restricted-imports': boundary(APPLICATION_FORBIDDEN) },
  },
  {
    files: ['src/infrastructure/**/*.ts'],
    rules: { 'no-restricted-imports': boundary(INFRASTRUCTURE_FORBIDDEN) },
  },
  {
    files: ['src/ui/**/*.{ts,tsx,astro}', 'src/pages/**/*.{ts,tsx,astro}', 'clients/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': boundary(PRESENTATION_FORBIDDEN) },
  },
];
