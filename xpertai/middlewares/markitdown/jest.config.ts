/* eslint-disable */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(readFileSync(join(__dirname, '.spec.swcrc'), 'utf-8'))

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false

export default {
  displayName: '@xpert-ai/plugin-markitdown',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig]
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage'
}
