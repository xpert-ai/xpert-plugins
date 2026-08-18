import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const configDir = dirname(fileURLToPath(import.meta.url));
const swcJestConfig = JSON.parse(
  readFileSync(join(configDir, '.spec.swcrc'), 'utf-8')
);
swcJestConfig.swcrc = false;

export default {
  displayName: '@xpert-ai/plugin-longcat',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
};
