import 'reflect-metadata'
import assert from 'node:assert/strict'
import test from 'node:test'
import { SaicDorisTools } from '../dist/lib/provider.js'

const provider = new SaicDorisTools({ run() { throw new Error('Configuration validation must not query Doris') } })
const manual = { mode: 'manual', host: 'localhost', username: 'root', database: 'fixture', password: '' }

test('provider rejects invalid saved connections without exposing credential values', async () => {
  for (const config of [
    { mode: 'platform' }, { mode: 'platform', dataSourceId: '' },
    { ...manual, host: '' }, { ...manual, username: '' }, { ...manual, database: '' },
    { ...manual, port: 0 }, { ...manual, port: 65536 }, { ...manual, port: 1.5 },
    { ...manual, fePort: 0 }, { ...manual, streamLoadMinRows: 0 },
    { ...manual, streamLoadChunkSize: 50001 }, { ...manual, streamLoadHosts: [''] },
    { ...manual, password: { private: 'must-not-appear' } }
  ]) {
    await assert.rejects(async () => provider.validateConfig(config), error =>
      error.getStatus() === 400 && !JSON.stringify(error.getResponse()).includes('must-not-appear'))
  }
})

test('provider accepts both modes, runtime defaults, empty passwords and explicit false', async () => {
  for (const config of [manual, { ...manual, useSsl: false, streamLoadEnabled: false },
    { mode: 'platform', dataSourceId: 'source-1' },
    { ...manual, port: 1, fePort: 65535, streamLoadMinRows: 1, streamLoadChunkSize: 50000 },
    { ...manual, mode: 'platform', dataSourceId: 'source-1' }
  ]) await provider.validateConfig(config)
})
