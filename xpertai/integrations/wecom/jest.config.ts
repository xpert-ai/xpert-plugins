/**
 * adds a docblock pointing Jest's loader at the new ts config, keeping the rest of the file untouched.
 *
 * @jest-config-loader-options {"project":"tsconfig.jest.json"}
 */
/* eslint-disable */
import { readFileSync } from 'fs'
const swcJestConfig = JSON.parse(readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'))

swcJestConfig.swcrc = false

export default {
  displayName: '@xpert-ai/plugin-wecom',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig]
  },
  transformIgnorePatterns: ['/node_modules/(?!(lodash-es)/)'],
  moduleNameMapper: {
    '^lodash-es$': '<rootDir>/../../test-utils/lodashEsMock.ts',
    '^@xpert-ai/chatkit-types$': '<rootDir>/../../test-utils/emptyModule.ts'
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
  testTimeout: 30000
}
