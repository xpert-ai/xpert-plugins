/**
 * adds a docblock pointing Jest's loader at the dedicated ts config for this file.
 *
 * @jest-config-loader-options {"project":"tsconfig.jest.json"}
 */
/* eslint-disable */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const configDir = dirname(fileURLToPath(import.meta.url));

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
  readFileSync(join(configDir, '.spec.swcrc'), 'utf-8')
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

export default {
  displayName: '@xpert-ai/plugin-openai',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  transformIgnorePatterns: ['/node_modules/(?!(lodash-es)/)'],
  moduleNameMapper: {
    '^lodash-es$': '<rootDir>/../../test-utils/lodashEsMock.ts'
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
  testTimeout: 30000,
};
