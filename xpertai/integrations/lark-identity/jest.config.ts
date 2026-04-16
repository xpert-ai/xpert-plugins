/* eslint-disable */
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

const swcConfigCandidates = [
  path.resolve(process.cwd(), 'integrations/lark-identity/.spec.swcrc'),
  path.resolve(process.cwd(), '.spec.swcrc'),
  '.spec.swcrc',
];
const swcConfigPath = swcConfigCandidates.find((candidate) => existsSync(candidate)) ?? swcConfigCandidates[0];

const swcJestConfig = JSON.parse(
  readFileSync(swcConfigPath, 'utf-8')
);

swcJestConfig.swcrc = false;

export default {
  displayName: '@xpert-ai/plugin-lark-identity',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
};
