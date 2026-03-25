/* eslint-disable */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const swcJestConfig = JSON.parse(readFileSync(join(__dirname, '.spec.swcrc'), 'utf-8'))

swcJestConfig.swcrc = false

export default {
  displayName: '@xpert-ai/plugin-zip-unzip-cli',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig]
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage'
}
