/**
 * @jest-config-loader-options {"project":"tsconfig.jest.json"}
 */
/* eslint-disable */
import { readFileSync } from 'fs'

const swcJestConfig = JSON.parse(readFileSync(`${process.cwd()}/.spec.swcrc`, 'utf-8'))

swcJestConfig.swcrc = false
swcJestConfig.module = { type: 'commonjs' }

export default {
  displayName: '@xpert-ai/plugin-community-wechat',
  rootDir: '.',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig]
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  coverageDirectory: 'test-output/jest/coverage',
  testTimeout: 30000
}
