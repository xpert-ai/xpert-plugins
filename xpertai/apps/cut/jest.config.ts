/**
 * @jest-config-loader-options {"project":"tsconfig.jest.json"}
 */
import { readFileSync } from 'node:fs'

const rootDir = __dirname
const swcJestConfig = JSON.parse(readFileSync(`${rootDir}/.spec.swcrc`, 'utf8'))
swcJestConfig.swcrc = false

export default {
  displayName: '@xpert-ai/plugin-cut',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig]
  },
  testMatch: ['<rootDir>/src/**/*(*.)@(spec|test).ts'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/dist/'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'html'],
  coverageDirectory: 'test-output/jest/coverage'
}
