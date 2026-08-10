import { readFileSync } from 'fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const swcJestConfig = JSON.parse(readFileSync(`${currentDirectory}/.spec.swcrc`, 'utf-8'))

swcJestConfig.swcrc = false

export default {
  displayName: '@xpert-ai/plugin-siliconflow',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig]
  },
  transformIgnorePatterns: [
    '/node_modules/.pnpm/(?!(lodash-es)@)',
    '/node_modules/(?!(?:\\.pnpm|lodash-es)(?:/|$))'
  ],
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage'
}
