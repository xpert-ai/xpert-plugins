import { readFileSync } from 'node:fs'

const swcJestConfig = JSON.parse(readFileSync(new URL('./.spec.swcrc', import.meta.url), 'utf8'))
swcJestConfig.swcrc = false
swcJestConfig.jsc.externalHelpers = false

export default {
  displayName: '@xpert-ai/plugin-xpert-quotation',
  testEnvironment: 'node',
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: { '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig] },
  testMatch: ['<rootDir>/src/**/*(*.)@(spec|test).ts'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/dist/'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'html'],
  coverageDirectory: 'test-output/jest/coverage'
}
