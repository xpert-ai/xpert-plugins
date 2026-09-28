import { ContractRiskAuditorService, SAMPLE_CONTRACTS } from '../dist/lib/contract-risk-auditor.service.js'

async function runRealIntegrationTests() {
  console.log('====================================================')
  console.log('  🚀 开始在真实运行环境中执行全方位集成与边界测试')
  console.log('====================================================\n')

  const service = new ContractRiskAuditorService()

  // 1. 测试多租户隔离
  console.log('👉 [测试 1] 多租户与权限范围数据隔离验证...')
  const tenantA = { tenantId: 'tenant-enterprise-A', organizationId: 'legal-dept', userId: 'lawyer-alice' }
  const tenantB = { tenantId: 'tenant-enterprise-B', organizationId: 'risk-dept', userId: 'lawyer-bob' }

  const recA = await service.auditContract(tenantA, 'contract-A-001', SAMPLE_CONTRACTS[0].content, '甲企业重型设备采购合同')
  console.log(`   ✅ 租户 A [${tenantA.tenantId}] 创建审查单: ${recA.id}, 识别行业: ${recA.detectedIndustry?.name}`)

  const listB = await service.listRecords(tenantB)
  const leakFound = listB.some(r => r.id === 'contract-A-001')
  if (leakFound) {
    throw new Error('❌ 致命安全漏洞：租户 B 读取到了租户 A 的私有合同！')
  }
  console.log(`   ✅ 租户 B [${tenantB.tenantId}] 审查单列表隔离验证成功 (未泄漏租户 A 数据)`)

  // 2. 测试磁盘文件持久化与服务重启恢复
  console.log('\n👉 [测试 2] 磁盘持久化与服务冷重启恢复验证...')
  const revisionResult = await service.acceptRevision(tenantA, recA.id, recA.risks[0].id, '【人工修改条款】：违约金以实际发生之直接损失为限，最高不超过5%')
  console.log(`   ✅ 租户 A 人工修改并采纳条款成功，新状态: ${revisionResult.risks[0].status}, isCustom: ${revisionResult.risks[0].isCustom}`)

  // 模拟冷重启：创建全新的服务实例
  const restartedService = new ContractRiskAuditorService()
  const restoredRec = await restartedService.getRecord(tenantA, 'contract-A-001')
  if (!restoredRec) {
    throw new Error('❌ 数据丢失：服务冷重启后未能从本地磁盘恢复历史审查单！')
  }
  if (restoredRec.risks[0].suggestedRevision !== '【人工修改条款】：违约金以实际发生之直接损失为限，最高不超过5%') {
    throw new Error('❌ 数据不一致：恢复的修改条款内容不匹配！')
  }
  console.log(`   ✅ 模拟服务冷重启成功！成功从磁盘加载并无损还原租户 A 的历史审查单 (包含人工微调条款)`)

  // 3. 测试大模型异常透明化（杜绝静默降级）
  console.log('\n👉 [测试 3] 大模型异常透明反馈机制验证（防止静默降级）...')
  process.env.LLM_API_KEY = 'mock-invalid-api-key-for-test'
  process.env.LLM_BASE_URL = 'http://127.0.0.1:18888/non-existent-endpoint'
  process.env.LLM_TIMEOUT_MS = '800'

  try {
    await service.auditContract(tenantA, 'test-err-id', '合同样例文本')
    throw new Error('❌ 错误掩盖漏洞：大模型调用失败时未抛出异常，发生了静默降级！')
  } catch (err) {
    if (err.message.includes('AI大模型审查失败')) {
      console.log(`   ✅ 验证成功：大模型异常被真实向上抛出，错误信息: "${err.message.slice(0, 60)}..."`)
    } else {
      throw err
    }
  } finally {
    delete process.env.LLM_API_KEY
    delete process.env.LLM_BASE_URL
    delete process.env.LLM_TIMEOUT_MS
  }

  // 4. 测试 4 大行业规则引擎与 Markdown 表格附录深度排查
  console.log('\n👉 [测试 4] 4 大行业规则引擎与多模态表格附录排查验证...')
  const pdfSample = SAMPLE_CONTRACTS[2] // 工程设备定制（含附录付款里程碑表）
  const pdfAudit = await service.auditContract(tenantA, 'pdf-table-audit', pdfSample.content, pdfSample.title)
  console.log(`   ✅ 识别行业: ${pdfAudit.detectedIndustry?.name}`)
  console.log(`   ✅ 适用法律标准: ${pdfAudit.detectedIndustry?.standardRef}`)
  console.log(`   ✅ 检出风险数: ${pdfAudit.risks.length}`)
  const milestoneRisk = pdfAudit.risks.find(r => r.category.includes('以审代付') || r.category.includes('工程'))
  if (!milestoneRisk) {
    throw new Error('❌ 未能检出附录表格中的「以审代付」高危风险条款！')
  }
  console.log(`   ✅ 成功检出附录表格高危条款: "${milestoneRisk.originalText.slice(0, 40)}..."`)

  console.log('\n====================================================')
  console.log('  🎉 所有核心场景与边界测试全部 100% 通过！')
  console.log('====================================================')
}

runRealIntegrationTests().catch(err => {
  console.error('测试失败:', err)
  process.exit(1)
})
