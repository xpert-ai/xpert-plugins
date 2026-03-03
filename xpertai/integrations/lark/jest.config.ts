/* eslint-disable */
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

const swcConfigCandidates = [
  path.resolve(process.cwd(), 'integrations/lark/.spec.swcrc'),
  path.resolve(process.cwd(), '.spec.swcrc'),
  '.spec.swcrc',
];
const swcConfigPath = swcConfigCandidates.find((candidate) => existsSync(candidate)) ?? swcConfigCandidates[0];

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
  readFileSync(swcConfigPath, 'utf-8')
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

export default {
  displayName: '@xpert-ai/plugin-lark',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
};
