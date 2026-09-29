/* eslint-disable */
import { readFileSync } from 'fs'
import { join } from 'path'

// jest 经 ts-node 以 CommonJS 编译本配置，全局 __dirname 可用（import.meta 仅 ESM 合法，不可用于此处）
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
  coverageDirectory: './coverage',
  // 24 核机器上 jest 默认起 23 个 worker，多会话并发跑测试时 node 提交内存会冲到 10GB+ 打满内存；
  // 这里锁定 worker 数并让空闲 worker 释放内存，代价是全量测试变慢
  maxWorkers: 4,
  workerIdleMemoryLimit: '512MB'
}
