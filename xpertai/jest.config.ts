/**
 * apply the same treatment for the workspace-level Jest config so the loader registers with the safe options on first use.
 * 
 * @jest-config-loader-options {"project":"./tsconfig.jest.json"}
 */
export default {
  displayName: '@xpert-plugins-starter/source',
  preset: './jest.preset.js',
  coverageDirectory: 'test-output/jest/coverage',
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.[jt]s?(x)',
    '<rootDir>/src/**/*(*.)@(spec|test).[jt]s?(x)',
  ],
};
