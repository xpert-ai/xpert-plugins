import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const configDir = dirname(fileURLToPath(import.meta.url))
const swcJestConfig = JSON.parse(readFileSync(join(configDir, '.spec.swcrc'), 'utf8'))
swcJestConfig.swcrc = false

export default {
  displayName: '@xpert-ai/plugin-baidu-netdisk-connector',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: { '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig] },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage'
}
