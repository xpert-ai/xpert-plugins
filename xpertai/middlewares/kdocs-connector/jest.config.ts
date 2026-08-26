/* eslint-disable */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Reading the SWC compilation config for the spec files
const configDir = dirname(fileURLToPath(import.meta.url));
const swcJestConfig = JSON.parse(
  readFileSync(join(configDir, '.spec.swcrc'), 'utf-8')
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

export default {
  displayName: '@xpert-ai/plugin-kdocs-connector',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig]
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage'
};
