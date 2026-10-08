/**
 * @jest-config-loader-options {"project":"tsconfig.jest.json"}
 */
/* eslint-disable */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Nx discovers this config from the workspace root; Jest runs from the package.
// Avoid import.meta because Jest's TypeScript config loader compiles as CommonJS.
const swcConfigCandidates = [
  resolve(process.cwd(), 'models/volcengine/.spec.swcrc'),
  resolve(process.cwd(), '.spec.swcrc'),
];
const swcConfigPath = swcConfigCandidates.find((candidate) => existsSync(candidate));
if (!swcConfigPath) throw new Error('Volcengine Jest SWC config was not found');

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
  readFileSync(swcConfigPath, 'utf-8')
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

export default {
  displayName: '@xpert-ai/plugin-volcengine',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  transformIgnorePatterns: [
    '/node_modules/.pnpm/(?!(lodash-es)@)',
    '/node_modules/(?!(?:\\.pnpm|lodash-es)(?:/|$))',
  ],
  moduleNameMapper: {
    '^@xpert-ai/chatkit-types$': '<rootDir>/../../test-utils/emptyModule.ts',
    '^lodash-es$': '<rootDir>/../../test-utils/lodashEsMock.ts',
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
};
