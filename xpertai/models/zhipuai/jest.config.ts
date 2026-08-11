/* eslint-disable */
import { readFileSync } from 'fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDirectory = dirname(fileURLToPath(import.meta.url))

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(readFileSync(`${currentDirectory}/.spec.swcrc`, 'utf-8'))

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false

export default {
  displayName: '@xpert-ai/plugin-zhipuai',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig]
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage'
}
