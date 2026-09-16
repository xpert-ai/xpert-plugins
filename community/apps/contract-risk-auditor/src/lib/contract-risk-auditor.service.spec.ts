import test from 'node:test'
import assert from 'node:assert/strict'
import { ContractRiskAuditorService, SAMPLE_CONTRACTS } from './contract-risk-auditor.service.js'

test('ContractRiskAuditorService - 核心业务逻辑与状态转移测试', async (t) => {
  const service = new ContractRiskAuditorService()
  const mockScope = { userId: 'test-user-1', tenantId: 'tenant-demo' }

  await t.test('1. 应该能够准确识别高危霸王条款（违约金过高、知识产权归属、单方免责等）', () => {
    const sample = SAMPLE_CONTRACTS[0]
    const risks = service.analyzeContractText(sample.content)

    assert.ok(risks.length >= 4, `应该检测出至少4项风险，实际检测出: ${risks.length}`)
    const highRisks = risks.filter((r) => r.riskLevel === 'HIGH')
    assert.ok(highRisks.length >= 2, '应该包含至少2个高危风险项')

    const hasDamagesRisk = risks.some((r) => r.category.includes('违约金'))
    assert.ok(hasDamagesRisk, '应该识别出违约金责任过重条款')

    const hasIpRisk = risks.some((r) => r.category.includes('知识产权'))
    assert.ok(hasIpRisk, '应该识别出知识产权归属霸王条款')
  })

  await t.test('2. 应该能够创建合同审查单，并持久化在记录库中', async () => {
    const customContent = '乙方须按合同总金额的30%向甲方支付违约赔偿金。甲方有权无需任何理由随时单方通知乙方立即终止本合同，且甲方无需支付乙方已发生之任何开发工时费用。'
    const record = await service.auditContract(mockScope, 'custom-test-1', customContent, '外包开发合同')

    assert.equal(record.id, 'custom-test-1')
    assert.equal(record.title, '外包开发合同')
    assert.ok(record.risks.length >= 2)
    assert.match(record.summary, /(检测完成|风险排查完成)/)

    const fetched = await service.getRecord(mockScope, 'custom-test-1')
    assert.deepEqual(fetched, record, '刷新或重新拉取时应该能够完整恢复该记录')
  })

  await t.test('3. 人工采纳修订建议后，应该自动替换原文中涉险语句并将状态置为 ACCEPTED', async () => {
    const record = await service.getRecord(mockScope, 'custom-test-1')
    assert.ok(record)
    const targetRisk = record.risks[0]

    const updated = await service.acceptRevision(mockScope, record.id, targetRisk.id)
    assert.equal(updated.risks.find((r) => r.id === targetRisk.id)?.status, 'ACCEPTED')
    assert.ok(!updated.revisedContent.includes(targetRisk.originalText), '定稿中不应再包含涉险原句')
    assert.ok(updated.revisedContent.includes(targetRisk.suggestedRevision), '定稿中应该包含建议修订语句')
  })

  await t.test('4. 人工忽略某项风险后，状态应置为 IGNORED 且不改变条款文本', async () => {
    const record = await service.getRecord(mockScope, 'custom-test-1')
    assert.ok(record)
    const secondRisk = record.risks[1]
    const contentBefore = record.revisedContent

    const updated = await service.ignoreRisk(mockScope, record.id, secondRisk.id)
    assert.equal(updated.risks.find((r) => r.id === secondRisk.id)?.status, 'IGNORED')
    assert.equal(updated.revisedContent, contentBefore, '忽略操作不应修改合同文本')
  })

  await t.test('5. 异常保护与边界校验：操作不存在的审查单或风险项应抛出可理解的错误', async () => {
    await assert.rejects(
      async () => {
        await service.acceptRevision(mockScope, 'non-existent-id', 'risk-1')
      },
      /未找到审查单记录/,
      '不存在的审查单应抛出友好错误'
    )
  })

  await t.test('6. 工作台数据获取应包含历史记录与内置案例，支持多版本快照恢复', async () => {
    const wbData = await service.getWorkbenchData(mockScope)
    assert.ok(wbData.records.length >= 2, '工作台应返回全部历史审查单')
    assert.ok(wbData.sampleContracts.length >= 2, '工作台应包含预置样例供快速演示')
  })

  await t.test('7. 应该能够自动识别合同所属行业（IT、建设工程、广告传媒、供应链）并适配行业专属规则', async () => {
    // 1. IT 软件合同自动识别
    const itSample = SAMPLE_CONTRACTS[1]
    const itProfile = service.detectContractIndustry(itSample.content, itSample.title)
    assert.equal(itProfile.code, 'IT_SOFTWARE')
    assert.ok(itProfile.standardRef.includes('技术合同编'))

    // 2. 建设工程合同自动识别
    const constrSample = SAMPLE_CONTRACTS[2]
    const constrProfile = service.detectContractIndustry(constrSample.content, constrSample.title)
    assert.equal(constrProfile.code, 'CONSTRUCTION_EQUIPMENT')
    assert.ok(constrProfile.standardRef.includes('保障中小企业款项支付条例'))

    // 3. 广告传媒合同自动识别
    const mediaSample = SAMPLE_CONTRACTS[3]
    const mediaProfile = service.detectContractIndustry(mediaSample.content, mediaSample.title)
    assert.equal(mediaProfile.code, 'MEDIA_ADVERTISING')
    assert.ok(mediaProfile.standardRef.includes('广告法'))

    // 4. 执行审查时应自动挂载行业 Profile 及专属风险
    const audited = await service.auditContract(mockScope, 'auto-industry-audit', mediaSample.content, mediaSample.title)
    assert.equal(audited.detectedIndustry?.code, 'MEDIA_ADVERTISING')
    assert.ok(audited.risks.some((r) => r.category.includes('广告营销') || r.riskAnalysis.includes('广告法')))
  })
})

