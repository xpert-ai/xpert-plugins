/* eslint-disable */
// @ts-nocheck - Jest config file, types are handled by Jest runtime
import { readFileSync } from 'fs';

// Reading the SWC compilation config for the spec files
// Note: __dirname is available in Jest's execution context
const swcJestConfig = JSON.parse(
  readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8')
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

export default {
  displayName: '@xpert-ai/plugin-minimax',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  transformIgnorePatterns: ['/node_modules/(?!(lodash-es)/)'],
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
};
