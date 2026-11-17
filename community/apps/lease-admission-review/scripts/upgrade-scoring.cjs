// Additive, idempotent upgrade. Run in the API environment before loading v0.2.
require('reflect-metadata')
const { DataSource } = require('typeorm')
const { pluginArtifactTableName } = require('@xpert-ai/plugin-sdk')
const db = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  synchronize: false
})
;(async () => {
  await db.initialize()
  const table = pluginArtifactTableName('lease_admission_review', 'case')
  if (!/^[a-z0-9_]+$/.test(table)) throw Error('Invalid plugin table name')
  await db.transaction(async (manager) => {
    await manager.query("SET LOCAL lock_timeout = '10s'")
    await manager.query(
      `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "reviewDraft" jsonb NULL, ADD COLUMN IF NOT EXISTS "assessment" jsonb NULL`
    )
  })
  console.log('Scoring columns available; existing rows preserved.')
})()
  .catch(() => {
    console.error('Scoring schema upgrade failed; details withheld.')
    process.exitCode = 1
  })
  .finally(() => (db.isInitialized ? db.destroy() : undefined))
