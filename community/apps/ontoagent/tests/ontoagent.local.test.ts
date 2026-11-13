import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OntoAgentService } from '../src/lib/ontoagent.service.js'
import { FakeRepo } from './fake-repo.js'

const scope = {
  tenantId: 'tenant-a',
  organizationId: 'org-a',
  userId: 'user-a',
  assistantId: 'assistant-a',
  conversationId: 'conv-a'
}

function makeService(storeDir: string, overrides: Record<string, unknown> = {}) {
  const answerRepo = new FakeRepo()
  const syncRepo = new FakeRepo()
  const transferRepo = new FakeRepo()
  const configResolver = {
    resolve: () => ({
      storeDir,
      contextSource: 'local',
      autoOntology: {},
      models: { baseUrl: 'http://mock.local/v1', apiKey: 'k', chatModel: 'mock-model' },
      ...overrides
    })
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

function deltaOf(baseVersion: string, assertion: Record<string, unknown>, deltaId = 'd-test') {
  return JSON.stringify({ deltaId, baseVersion: { hash: baseVersion }, ops: [{ op: 'assert', assertion }] })
}

function assertion(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    s: 't:generated-' + id,
    p: 'r:hasValue',
    o: 'v:1',
    q: {},
    scope: 'task:gen',
    status: 'candidate',
    evidence: [{ kind: 'quote', locator: 'corpus:1' }],
    ...overrides
  }
}

test('种子：导入即版本前进，重复导入幂等且不改版本', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ontoagent-local-'))
  try {
    const { service } = makeService(dir)
    const first = await service.seed(scope)
    assert.equal(first.seeded, true)
    assert.ok(first.accepted > 0)
    assert.match(first.version, /^sha256:/)

    const health = service.localHealth(scope)
    assert.ok(health.assertions > 0)
    assert.ok(health.sampleTerms.some((term) => term.label.includes('收入')))

    const second = await service.seed(scope)
    assert.equal(second.seeded, false)
    assert.equal(second.accepted, 0)
    assert.equal(second.version, first.version)
    assert.equal(service.localHealth(scope).assertions, health.assertions)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('local 注入：按任务召回条目并把定义与 join 放进 prompt，版本与库一致', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ontoagent-local-'))
  try {
    const { service } = makeService(dir)
    await service.seed(scope)
    const health = service.localHealth(scope)

    const { prepared, manifest } = await service.prepareForTask(scope, '收入按什么日期确认？')
    assert.equal(manifest, null)
    assert.equal(prepared.version, health.version)
    assert.ok(prepared.retrieval.hits > 0)
    assert.ok(prepared.focus.length > 0)
    assert.match(prepared.prompt, /收入/)
    assert.match(prepared.prompt, /开票日期|InvoiceDate/)
    assert.equal(service.localHealth(scope).contextSource, 'local')

    const terms = await service.listTerms(scope, { search: '收入' })
    assert.ok(terms.total >= 1)
    assert.ok(terms.items.some((term) => term.label.includes('收入')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('闸门拒绝：缺证据的断言不落盘，版本不变', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ontoagent-local-'))
  try {
    const { service } = makeService(dir)
    const version = service.localHealth(scope).version
    const result = await service.commitDelta(
      scope,
      deltaOf(version, assertion('a:no-evidence', { evidence: [] }))
    )
    assert.equal(result.ok, false)
    assert.equal(result.version, version)
    assert.ok((result.rejected ?? []).some((finding) => finding.rule.includes('evidence')))
    assert.equal(service.localHealth(scope).assertions, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('版本冲突：baseVersion 过期返回 conflict 且不写入', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ontoagent-local-'))
  try {
    const { service } = makeService(dir)
    await service.seed(scope)
    const version = service.localHealth(scope).version
    const result = await service.commitDelta(
      scope,
      deltaOf('sha256:deadbeef', assertion('a:stale'))
    )
    assert.equal(result.ok, false)
    assert.equal(result.stage, 'conflict')
    assert.equal(result.version, version)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('T2 人审：gov: 顶层变更默认挂起，不写盘也不悄悄签发', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ontoagent-local-'))
  try {
    const { service } = makeService(dir)
    const version = service.localHealth(scope).version
    const result = await service.commitDelta(
      scope,
      deltaOf(version, assertion('a:gov-top', { scope: 'gov:top', s: 'c:TopConcept' }))
    )
    assert.equal(result.ok, false)
    assert.equal(result.needsHuman, true)
    assert.ok((result.escalated ?? []).length >= 1)
    assert.equal(result.version, version)
    assert.equal(service.localHealth(scope).assertions, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('生成产线：prompt 的 base_version 被原样遵守，落盘后版本前进', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ontoagent-local-'))
  const original = globalThis.fetch
  try {
    const { service } = makeService(dir)
    const calls: string[] = []
    globalThis.fetch = (async (_url: string, init: { body?: string }) => {
      const body = JSON.parse(String(init.body ?? '{}')) as { messages?: Array<{ content?: string }> }
      const prompt = body.messages?.map((message) => message.content ?? '').join('\n') ?? ''
      const base = /## base_version[^\n]*\n([^\n]+)/.exec(prompt)?.[1]?.trim() ?? ''
      calls.push(base)
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  deltaId: 'd-gen-1',
                  baseVersion: { hash: base },
                  ops: [
                    {
                      op: 'assert',
                      assertion: {
                        id: 'a:gen-1',
                        s: 't:generated-record',
                        p: 'r:hasValue',
                        o: 'v:1',
                        q: {},
                        scope: 'task:gen',
                        status: 'candidate',
                        evidence: [{ kind: 'quote', locator: 'corpus:1' }]
                      }
                    }
                  ]
                })
              }
            }
          ]
        })
      }
    }) as never

    const before = service.localHealth(scope)
    const result = await service.generate(scope, { task: '记录一条生成断言', corpus: [{ id: 'c1', text: '单元测试语料' }] })
    assert.equal(result.stage, 'done')
    assert.equal(result.accepted, 1)
    assert.equal(result.baseVersionMismatch, false)
    assert.equal(calls.length, 1)
    assert.notEqual(result.version, before.version)
    assert.equal(service.localHealth(scope).assertions, before.assertions + 1)

    // 再生成一次：断言条目不膨胀（append-only 里同 id 折叠），重复数可见
    const again = await service.generate(scope, { task: '记录一条生成断言', corpus: [{ id: 'c1', text: '单元测试语料' }] })
    assert.ok(again.duplicates > 0)
    assert.equal(service.localHealth(scope).assertions, before.assertions + 1)
  } finally {
    globalThis.fetch = original
    rmSync(dir, { recursive: true, force: true })
  }
})

test('生成产线：未配对话模型时显式失败，不伪造 accepted', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ontoagent-local-'))
  try {
    const { service } = makeService(dir, { models: {} })
    const result = await service.generate(scope, { task: '任意任务' })
    assert.equal(result.ok, false)
    assert.equal(result.stage, 'extract')
    assert.match(result.reasons.join('\n'), /chat_model_missing/)
    assert.equal(service.localHealth(scope).assertions, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('转交：幂等去重、收件箱可见、领取幂等、代次围栏与深度上限', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ontoagent-local-'))
  try {
    const { service } = makeService(dir, { transfer: { maxDepth: 1 } })
    await service.seed(scope)

    const first = await service.transferPacket(scope, { recipient: 'assistant:analyst', task: '收入怎么确认' })
    assert.equal(first.ok, true)
    assert.equal(first.duplicated, false)
    assert.equal(first.depth, 0)
    assert.ok((first.assertions ?? 0) > 0)
    assert.match(String(first.baseVersion), /^sha256:/)

    const repeat = await service.transferPacket(scope, { recipient: 'assistant:analyst', task: '收入怎么确认' })
    assert.equal(repeat.duplicated, true)
    assert.equal(repeat.transferId, first.transferId)

    const inbox = await service.listTransfers(scope, {})
    assert.equal(inbox.total, 1)
    assert.equal(inbox.items[0]!.status, 'received')
    assert.equal(inbox.items[0]!.depth, 0)

    const staleGeneration = await service.acceptTransfer(scope, {
      transferId: first.transferId as string,
      generation: 9
    })
    assert.equal(staleGeneration.ok, false)
    assert.equal(staleGeneration.reason, 'transfer_generation_stale')

    const accepted = await service.acceptTransfer(scope, { transferId: first.transferId as string })
    assert.equal(accepted.ok, true)
    assert.equal(accepted.replayed, false)
    const replay = await service.acceptTransfer(scope, { transferId: first.transferId as string })
    assert.equal(replay.replayed, true)
    assert.equal((await service.listTransfers(scope, {})).items[0]!.status, 'done')

    // 原样转交一层（depth=1）仍在上限内
    const forward1 = await service.transferPacket(scope, {
      recipient: 'assistant:reviewer',
      task: '收入怎么确认',
      parentTransferId: first.transferId as string
    })
    assert.equal(forward1.ok, true)
    assert.equal(forward1.depth, 1)

    // 再转交一层超过 maxDepth=1 → 显式拒绝，不落新行
    const forward2 = await service.transferPacket(scope, {
      recipient: 'assistant:auditor',
      task: '收入怎么确认',
      parentTransferId: forward1.transferId as string
    })
    assert.equal(forward2.ok, false)
    assert.equal(forward2.reason, 'transfer_depth_exceeded')
    assert.equal((await service.listTransfers(scope, {})).total, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('转交：auto 模式拒绝，避免在只读镜像上演化出第二套写路径', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ontoagent-local-'))
  try {
    const { service } = makeService(dir, { contextSource: 'auto' })
    await assert.rejects(
      () => service.transferPacket(scope, { recipient: 'assistant:analyst', task: '收入' }),
      /transfer_requires_local_context_source/
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('权威导入：TTL 经闸门落盘，标签与子类关系可检索', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ontoagent-local-'))
  try {
    const { service } = makeService(dir)
    const ttl = `
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .

c:Contract a owl:Class .
c:Contract rdfs:label "合同 Contract" .
c:Contract skos:definition "双方签署的具有法律约束力的协议；以合同编号唯一标识。" .
c:Contract rdfs:subClassOf c:Document .

c:Document a owl:Class .
c:Document rdfs:label "文档 Document" .
`
    const before = service.localHealth(scope)
    const result = await service.importTtl(scope, ttl, 'test:contract-ontology')
    assert.ok(result.accepted > 0)
    assert.ok(result.terms >= 2)
    assert.ok(result.labeled >= 2)
    assert.deepEqual(result.unknownPredicates, [])
    assert.notEqual(result.version, before.version)

    const terms = await service.listTerms(scope, { search: '合同' })
    assert.ok(terms.items.some((term) => term.id === 'c:Contract' && term.label.includes('合同')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
