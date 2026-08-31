/* eslint-disable */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const swcConfigPath = [
  join(process.cwd(), 'xpertai/middlewares/dingtalk-connector/.spec.swcrc'),
  join(process.cwd(), 'middlewares/dingtalk-connector/.spec.swcrc'),
  join(process.cwd(), '.spec.swcrc')
].find((path) => existsSync(path))

if (!swcConfigPath) {
  throw new Error('Unable to locate DingTalk connector SWC config')
}

const swcJestConfig = JSON.parse(readFileSync(swcConfigPath, 'utf-8'))
swcJestConfig.swcrc = false

export default {
  displayName: '@xpert-ai/plugin-dingtalk-connector',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig]
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage'
}
