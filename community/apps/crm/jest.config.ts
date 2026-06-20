/* eslint-disable */
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const { exclude: _, ...swcJestConfig } = JSON.parse(readFileSync(join(__dirname, '.swcrc'), 'utf-8'))

if (swcJestConfig.swcrc === undefined) {
  swcJestConfig.swcrc = false
}

export default {
  displayName: 'crm',
  preset: '../../../jest.preset.js',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig]
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  testEnvironment: 'node',
  coverageDirectory: '../../../coverage/apps/crm'
}
