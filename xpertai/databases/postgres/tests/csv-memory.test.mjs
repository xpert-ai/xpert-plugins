import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openCsvSource, readCsvHeader } from '../dist/lib/postgres.csv.js'

test('memory-upload CSV retains its header and all multibyte rows', async () => {
  const text = 'region,amount\n华东,10.250000\nWest,3.000000\n'
  const source = await readCsvHeader(openCsvSource({ buffer: Buffer.from(text) }))
  assert.equal(source.header, 'region,amount')
  assert.equal(source.hasDataRows, true)
  const chunks = []
  for await (const chunk of source.stream) chunks.push(chunk)
  assert.equal(Buffer.concat(chunks).toString(), text)
})

test('header-only uploads are reported as having no data', async () => {
  const source = await readCsvHeader(openCsvSource({ buffer: Buffer.from('region,amount\n') }))
  assert.equal(source.hasDataRows, false)
  source.stream.destroy()
  assert.throws(() => openCsvSource({}), /CSV file stream is empty/)
})
