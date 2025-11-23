const fs = require('fs');

const swcJestConfig = JSON.parse(
  fs.readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8')
);

swcJestConfig.swcrc = false;

module.exports = {
  displayName: '@xpert-ai/plugin-pdfium',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
};
