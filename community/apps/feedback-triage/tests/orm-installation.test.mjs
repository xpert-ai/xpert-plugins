import assert from 'node:assert/strict'
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { FeedbackTicket } from '../dist/ticket.entity.js'

test('an isolated archive uses the host DataSource identity even when private ORM copies shadow it', async (t) => {
  const req = createRequire(import.meta.url)
  const sdkPath = req.resolve('@xpert-ai/plugin-sdk/package.json')
  const host = createRequire(sdkPath)
  const root = await mkdtemp(join(tmpdir(), 'feedback-orm-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'node_modules/@xpert-ai'), { recursive: true })
  await symlink(dirname(sdkPath), join(root, 'node_modules/@xpert-ai/plugin-sdk'), 'dir')
  // Any accidental nearest-package import would load one of these private copies.
  for (const name of ['typeorm', '@nestjs/typeorm']) {
    const target = join(root, 'node_modules', name)
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'index.js'), 'throw new Error("private ORM loaded")')
  }
  const entry = join(root, 'host-orm.mjs')
  await copyFile(new URL('../dist/host-orm.js', import.meta.url), entry)
  const { TypeOrmModule } = await import(pathToFileURL(entry).href)
  const feature = TypeOrmModule.forFeature([FeedbackTicket])
  const provider = feature.providers.find((p) => p.provide === 'FeedbackTicketRepository')
  assert.equal(provider.inject[0], host('@nestjs/typeorm').getDataSourceToken())
})
