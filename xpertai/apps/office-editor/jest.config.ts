/**
 * @jest-config-loader-options {"project":"tsconfig.jest.json"}
 */
import { readFileSync } from 'fs'

const swcJestConfig = JSON.parse(readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'))

swcJestConfig.swcrc = false

export default {
  displayName: '@xpert-ai/plugin-office-editor',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.(?:[tj]s|mjs)$': ['@swc/jest', swcJestConfig]
  },
  // Extend the shared ESM allowlist with the published XLSX package.
  transformIgnorePatterns: [
    'node_modules/(?!\\.pnpm(?:/|$)|@xpert-ai/(?:artifact-tool|chatkit-types)(?:/|$)|lodash-es(?:/|$))',
    'node_modules/\\.pnpm/(?!@xpert-ai\\+(?:artifact-tool|chatkit-types)@|lodash-es@)'
  ],
  testMatch: ['<rootDir>/src/**/*(*.)@(spec|test).ts'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/dist/'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'html'],
  coverageDirectory: 'test-output/jest/coverage'
}
