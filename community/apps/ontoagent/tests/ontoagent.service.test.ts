import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OntoAgentService } from '../src/lib/ontoagent.service.js'
import { FakeRepo } from './fake-repo.js'
import type { PreparedPrompt } from '../src/lib/vendor/pipeline-types.js'

function makeService(storeDir: string) {
  const answerRepo = new FakeRepo()
  const syncRepo = new FakeRepo()
  const transferRepo = new FakeRepo()
  const configResolver = {
    // 这组用例验证 auto 只读镜像的原有红线；local 产线用例见 ontoagent.local.test.ts
    resolve: () => ({ storeDir, contextSource: 'auto', autoOntology: {}, models: {} })
  }
  return {
    service: new OntoAgentService(
      answerRepo as never,
      syncRepo as never,
      transferRepo as never,
      configResolver as never
    ),
    answerRepo,
    syncRepo,
    transferRepo
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
