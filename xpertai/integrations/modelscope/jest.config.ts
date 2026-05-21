/* eslint-disable */
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';

const swcConfigCandidates = [
  path.resolve(process.cwd(), 'integrations/modelscope/.spec.swcrc'),
  path.resolve(process.cwd(), '.spec.swcrc'),
  '.spec.swcrc',
];
const swcConfigPath = swcConfigCandidates.find((candidate) => existsSync(candidate)) ?? swcConfigCandidates[0];

const swcJestConfig = JSON.parse(
  readFileSync(swcConfigPath, 'utf-8')
);

swcJestConfig.swcrc = false;

export default {
  displayName: '@xpert-ai/plugin-modelscope',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
};
