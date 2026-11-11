module.exports = {
  displayName: 'supplier-delivery-followup',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  // The SDK's CommonJS entry imports lodash-es; let SWC compile that ESM dependency.
  transformIgnorePatterns: ['/node_modules/(?!\\.pnpm/|lodash-es/)'],
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', {
      swcrc: false,
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true }
      },
      module: { type: 'commonjs' }
    }]
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  coverageDirectory: '../../../coverage/apps/supplier-delivery-followup'
}
