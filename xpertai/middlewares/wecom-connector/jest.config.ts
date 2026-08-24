import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const swcConfigCandidates = [
  join(process.cwd(), 'middlewares/wecom-connector/.spec.swcrc'),
  join(process.cwd(), '.spec.swcrc'),
  '.spec.swcrc'
]
const swcConfigPath = swcConfigCandidates.find((candidate) => existsSync(candidate)) ?? swcConfigCandidates[0]

const swcJestConfig = JSON.parse(readFileSync(swcConfigPath, 'utf-8'))
swcJestConfig.swcrc = false

export default {
  displayName: '@xpert-ai/plugin-wecom-connector',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig]
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage'
}
