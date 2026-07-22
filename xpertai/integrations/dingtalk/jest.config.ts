/* eslint-disable */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const swcConfigCandidates = [
  resolve(process.cwd(), '.spec.swcrc'),
  resolve(process.cwd(), 'integrations/dingtalk/.spec.swcrc'),
  resolve(process.cwd(), 'xpertai/integrations/dingtalk/.spec.swcrc'),
];
const swcConfigPath = swcConfigCandidates.find((candidate) => existsSync(candidate));

if (!swcConfigPath) {
  throw new Error(`Unable to locate DingTalk Jest SWC config. Searched: ${swcConfigCandidates.join(', ')}`);
}

const swcJestConfig = JSON.parse(
  readFileSync(swcConfigPath, 'utf-8')
);

swcJestConfig.swcrc = false;

export default {
  displayName: '@xpert-ai/plugin-dingtalk',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
};
