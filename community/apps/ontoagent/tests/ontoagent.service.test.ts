import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OntoAgentService } from '../src/lib/ontoagent.service.js'
import type { PreparedPrompt } from '../src/lib/vendor/pipeline-types.js'

/** 轻量 TypeORM 替身：只实现本服务用到的方法，断言行级业务结果而非调用次数。 */
class FakeRepo<T extends Record<string, unknown>> {
  rows: Array<Record<string, unknown>> = []

  create(fields: Partial<T>): T {
    return { ...fields } as T
  }

  async save(row: Record<string, unknown>) {
    const index = this.rows.findIndex((existing) => existing['id'] !== undefined && existing['id'] === row['id'])
    if (index >= 0) this.rows[index] = { ...this.rows[index], ...row }
    else {
      row['id'] = `id-${this.rows.length + 1}`
      this.rows.push(row)
    }
    return row
  }

  async find() {
    return [...this.rows]
  }

  async findOne(options: { where: Record<string, unknown> }) {
    return this.rows.find((row) => matches(row, options.where)) ?? null
  }

  async findAndCount(options: { where: Record<string, unknown>; skip?: number; take?: number }) {
    const matched = this.rows.filter((row) => matches(row, options.where))
    const skip = options.skip ?? 0
    return [matched.slice(skip, options.take === undefined ? undefined : skip + options.take), matched.length]
  }
}

function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where ?? {}).every(([key, expected]) => {
    if (expected && typeof expected === 'object' && (expected as { _type?: string })._type === 'isNull') {
      return row[key] === null || row[key] === undefined
    }
    return row[key] === expected
  })
}

function makeService(storeDir: string) {
  const answerRepo = new FakeRepo()
  const syncRepo = new FakeRepo()
  const configResolver = {
    resolve: () => ({ storeDir, autoOntology: {}, models: {} })
  }
  return {
    service: new OntoAgentService(answerRepo as never, syncRepo as never, configResolver as never),
    answerRepo,
    syncRepo
  }
}

function makePrepared(): PreparedPrompt {
  return {
    prompt: '# GOVERNED ONTOLOGY CONTEXT\n- auto_snapshot_missing',
    focus: [],
    bootstrapped: false,
    bootstrapResults: [],
    version: 'sha256:test',
    retrieval: {
      arm: 'lexical',
      indexVersion: 'sha256:test',
      candidates: 0,
      hits: 0,
      noSignal: true,
      degraded: true,
      reason: 'auto_snapshot_missing',
      relationIds: [],
      cost: { embedded: 0, judged: 0, injected: 0, chars: 10 }
    }
  }
}

const scope = { tenantId: 'tenant-a', organizationId: 'org-a', userId: 'user-a', assistantId: 'assistant-a', conversationId: 'conv-a' }

test('空镜像：状态为空，prepare 显式 auto_snapshot_missing，不生成、不伪装覆盖', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ontoagent-test-'))
  try {
    const { service } = makeService(dir)
    const status = await service.getStatus(scope)
    assert.equal(status.manifest, null)
    assert.equal(status.assertionCount, 0)
    assert.deepEqual(status.items, [])

    const { prepared } = await service.prepareForTask(scope, 'Revenue 的认证口径是什么？')
    assert.equal(prepared.retrieval.reason, 'auto_snapshot_missing')
    assert.equal(prepared.retrieval.degraded, true)
    assert.match(prepared.prompt, /auto_snapshot_missing/)

    const terms = await service.listTerms(scope, {})
    assert.equal(terms.total, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('回答记录：同对话同内容去重，审核状态可推进且幂等', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ontoagent-test-'))
  try {
    const { service, answerRepo } = makeService(dir)
    const input = { question: 'Revenue 口径？', answer: '当前未同步，无法给出认证口径。', prepared: makePrepared() }
    const first = await service.recordProposedAnswer(scope, input)
    const second = await service.recordProposedAnswer(scope, input)
    assert.equal(answerRepo.rows.length, 1)
    assert.equal(first!['status'], 'proposed')
    assert.equal(first!['mirrorVersion'], 'sha256:test')
    assert.equal(second!['id'], first!['id'])

    const confirmed = await service.reviewAnswer(scope, first!['id'] as string, 'confirmed', '口径已核对')
    assert.equal(confirmed['status'], 'confirmed')
    assert.ok(confirmed['reviewedAt'] instanceof Date)
    const again = await service.reviewAnswer(scope, first!['id'] as string, 'confirmed')
    assert.equal(again['status'], 'confirmed')
    assert.equal(answerRepo.rows.length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('未配置 Auto 凭证：同步显式失败并留下 failed 运行记录', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ontoagent-test-'))
  try {
    const { service, syncRepo } = makeService(dir)
    await assert.rejects(() => service.syncNow(scope), /auto_config_missing/)
    assert.equal(syncRepo.rows.length, 1)
    assert.equal(syncRepo.rows[0]!['status'], 'failed')
    assert.match(String(syncRepo.rows[0]!['errorMessage']), /auto_config_missing/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
