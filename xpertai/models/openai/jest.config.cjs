const { readFileSync } = require('fs')

const swcJestConfig = JSON.parse(readFileSync(`${__dirname}/.spec.swcrc`, 'utf8'))
swcJestConfig.swcrc = false

module.exports = {
  displayName: '@xpert-ai/plugin-openai',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: { '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig] },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^lodash-es$': '<rootDir>/../../test-utils/lodashEsMock.ts'
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
  testTimeout: 30000
}
