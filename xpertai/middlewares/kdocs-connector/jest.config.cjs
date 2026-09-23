const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const swcJestConfig = JSON.parse(readFileSync(join(__dirname, '.spec.swcrc'), 'utf8'))
swcJestConfig.swcrc = false
swcJestConfig.module = { type: 'commonjs' }

module.exports = {
  displayName: '@xpert-ai/plugin-kdocs-connector',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: { '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig] },
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  moduleFileExtensions: ['ts', 'js'],
  coverageDirectory: 'test-output/jest/coverage'
}
