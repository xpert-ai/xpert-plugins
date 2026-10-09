/* eslint-disable */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const swcJestConfig = JSON.parse(readFileSync(join(moduleDir, '.spec.swcrc'), 'utf-8'))
swcJestConfig.swcrc = false

export default {
  displayName: 'codexpert-connector',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig]
  },
  moduleFileExtensions: ['ts', 'js', 'html']
}
