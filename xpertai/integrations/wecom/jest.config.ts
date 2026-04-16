/* eslint-disable */
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const swcJestConfig = JSON.parse(readFileSync(join(__dirname, '.spec.swcrc'), 'utf-8'))

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
