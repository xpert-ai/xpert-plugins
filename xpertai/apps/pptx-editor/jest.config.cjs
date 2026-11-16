module.exports = {
  displayName: 'pptx-editor', testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/tests/**/*.spec.ts'],
  transform: { '^.+\\.[jt]sx?$': ['@swc/jest', { jsc: { parser: { syntax: 'typescript', tsx: true, decorators: true }, target: 'es2022', transform: { legacyDecorator: true, decoratorMetadata: true } }, module: { type: 'commonjs' } }] },
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  setupFiles: ['<rootDir>/tests/setup.cjs']
}
