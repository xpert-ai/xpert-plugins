/**
 * adds a docblock pointing Jest's loader at the new ts config, keeping the rest of the file untouched.
 *
 * @jest-config-loader-options {"project":"tsconfig.jest.json"}
 */
/* eslint-disable */
const { readFileSync } = require('fs');
const { join } = require('path');

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
  readFileSync(join(__dirname, '.spec.swcrc'), 'utf-8')
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

module.exports = {
  displayName: '@xpert-ai/plugin-tongyi',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  transformIgnorePatterns: ['/node_modules/(?!(lodash-es)/)'],
  moduleNameMapper: {
    '^lodash-es$': '<rootDir>/../../test-utils/lodashEsMock.ts',
    '^@xpert-ai/chatkit-types$': '<rootDir>/../../test-utils/emptyModule.ts',
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
  testTimeout: 30000,
};
