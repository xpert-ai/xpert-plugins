/**
 * @jest-config-loader-options {"project":"tsconfig.jest.json"}
 */
import { readFileSync } from 'node:fs'

const swcJestConfig = JSON.parse(readFileSync(`${__dirname}/.spec.swcrc`, 'utf8'))
swcJestConfig.swcrc = false

export default {
  displayName: '@xpert-ai/plugin-docx-editor',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig]
  },
  testMatch: [
    '<rootDir>/src/lib/docx-editor.service.spec.ts',
    '<rootDir>/src/lib/docx-editor-view.provider.spec.ts',
    '<rootDir>/src/lib/docx-editor.middleware.spec.ts'
  ],
  transformIgnorePatterns: [
    '<rootDir>/../../node_modules/.pnpm/(?!(lodash-es)@)',
    'node_modules/(?!.pnpm|lodash-es/)'
  ],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/dist/'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'html'],
  coverageDirectory: 'test-output/jest/coverage'
}
