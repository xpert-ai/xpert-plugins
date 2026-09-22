import 'reflect-metadata'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, rename } from 'node:fs/promises'
import { DataSource } from 'typeorm'
import { DemandEntity } from '../dist/entity.js'
import { DemandService } from '../dist/service.js'
import { JevEvaluator } from '../dist/jev.js'
import { loadJevCredentials } from './credentials.js'
loadJevCredentials()
const db = new DataSource({ type: 'sqljs', entities: [DemandEntity], synchronize: true })
await db.initialize()
try {
 const service = new DemandService(db.getRepository(DemandEntity), new JevEvaluator())
 const scope = { tenantId: 'live-test', organizationId: 'synthetic', userId: 'reviewer' }
 const created = await service.create(scope, { requestId: randomUUID(), customer: '合成测试客户', title: '汽配门店询价小程序', source: '我们有三家汽配门店，需要微信小程序让维修厂查库存和询价。预算三万元，希望六周内上线，老板下周可以确认需求。' })
 const assessed = await service.evaluate(scope, created.id)
 assert.equal(assessed.status, 'review', `Live assessment failed: ${assessed.errorCode}`)
 assert.ok(assessed.assessment); assert.equal(assessed.assessment.category, 'miniapp')
 const confirmed = await service.confirm(scope, created.id, { revision: assessed.revision, category: 'miniapp', priority: 'normal', nextStep: 'discovery', note: '先核对库存系统接口与预算边界。' })
 assert.equal((await service.get(scope, created.id)).status, 'confirmed')
 const receipt = { testedAt: new Date().toISOString(), environment: 'local service + SQL.js, NOT installed Xpert', syntheticData: true,
  model: assessed.assessment.model, category: assessed.assessment.category, nextStep: assessed.assessment.nextStep,
  inputTokens: assessed.assessment.inputTokens, outputTokens: assessed.assessment.outputTokens, finalStatus: confirmed.status }
 await mkdir('docs', { recursive: true }); await writeFile('docs/live-check.json.tmp', JSON.stringify(receipt, null, 2)); await rename('docs/live-check.json.tmp', 'docs/live-check.json')
 console.log(JSON.stringify(receipt, null, 2))
} finally { await db.destroy() }
