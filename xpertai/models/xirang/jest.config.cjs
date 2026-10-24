const fs = require('fs')

const swcJestConfig = JSON.parse(fs.readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'))
swcJestConfig.swcrc = false

module.exports = {
  displayName: '@xpert-ai/plugin-xirang',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig]
  },
  // contracts imports the ESM-only ChatKit package; handle pnpm's real paths too.
  transformIgnorePatterns: [
    '/node_modules/(?!((?:\\.pnpm/[^/]+/node_modules/)?(?:lodash-es|@xpert-ai/chatkit-types))(?:/|$))'
  ],
  moduleNameMapper: {
    '^lodash-es$': '<rootDir>/../../test-utils/lodashEsMock.ts'
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage'
}
