/**
 * @jest-config-loader-options {"project":"tsconfig.jest.json"}
 */
/* eslint-disable */
import { readFileSync } from 'fs'

const swcJestConfig = JSON.parse(readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'))
swcJestConfig.swcrc = false

export default {
  displayName: '@xpert-ai/plugin-kling',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig]
  },
  transformIgnorePatterns: [
    '/node_modules/.pnpm/(?!(lodash-es)@)',
    '/node_modules/(?!(?:\\.pnpm|lodash-es)(?:/|$))'
  ],
  moduleNameMapper: {
    '^lodash-es$': '<rootDir>/../../test-utils/lodashEsMock.ts'
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage'
}
