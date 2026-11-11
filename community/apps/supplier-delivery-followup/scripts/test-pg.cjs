const { spawnSync } = require('node:child_process')

if (!process.env.SUPPLIER_DELIVERY_TEST_PG_URL) {
  console.error(
    'Set SUPPLIER_DELIVERY_TEST_PG_URL to a PostgreSQL test database URL before running test:pg (database name must contain "test").'
  )
  process.exit(1)
}
const result = spawnSync(
  process.execPath,
  [require.resolve('jest/bin/jest'), '--config', 'jest.config.cjs', '--runInBand', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: process.env
  }
)
if (result.error) console.error(result.error.message)
process.exit(result.status ?? 1)
