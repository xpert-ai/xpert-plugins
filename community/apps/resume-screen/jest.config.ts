/* eslint-disable */
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Reading the SWC compilation config and remove the "exclude"
// so that the test files are also compiled by SWC
const { exclude: _, ...swcJestConfig } = JSON.parse(readFileSync(join(__dirname, '.swcrc'), 'utf-8'))

// disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves.
if (swcJestConfig.swcrc === undefined) {
  swcJestConfig.swcrc = false
}

export default {
  displayName: 'resume-screen',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig]
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  coverageDirectory: './coverage'
}
