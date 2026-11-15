import { readFileSync } from 'fs';

const swcJestConfig = JSON.parse(
  readFileSync(new URL('./.spec.swcrc', import.meta.url), 'utf-8')
);

swcJestConfig.swcrc = false;

export default {
  displayName: '@xpert-ai/plugin-echarts-mcp-app',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
};
