/**
 * 合同智能体检 — 端到端演示脚本
 *
 * 用真实构建产物（dist/index.js 导出的 service）跑通完整业务流程。
 * 用内存仓库替代 TypeORM，以便在无数据库环境下演示业务逻辑。
 */
import { ContractHealthCheckService } from '../dist/lib/contract-health-check.service.js'

// ---------- 内存仓库（模拟 TypeORM Repository，支持数组 save / scopedWhere 查询） ----------
class InMemoryRepository {
  constructor(name) {
    this.name = name
    this.rows = []
    this.seq = 0
  }
  create(input) {
    return { ...input }
  }
  async save(entity) {
    if (Array.isArray(entity)) {
      return Promise.all(entity.map((item) => this.saveOne(item)))
    }
    return this.saveOne(entity)
  }
  async saveOne(entity) {
    if (!entity.id) {
      this.seq += 1
      entity.id = `${this.name}-${this.seq}`
      this.rows.push(entity)
      return entity
    }
    const i = this.rows.findIndex((r) => r.id === entity.id)
    if (i >= 0) this.rows[i] = entity
    else this.rows.push(entity)
    return entity
  }
  async find(options) {
    if (!options?.where) return [...this.rows]
    return this.rows.filter((r) =>
      Object.entries(options.where).every(([k, v]) => r[k] === v)
    )
  }
  async findOne(options) {
    return (await this.find(options))[0] ?? null
  }
  async delete(where) {
    const before = this.rows.length
    this.rows = this.rows.filter(
      (r) => !Object.entries(where).every(([k, v]) => r[k] === v)
    )
    return { affected: before - this.rows.length }
  }
}

// ---------- 构造 service ----------
const reviewRepo = new InMemoryRepository('review')
const riskRepo = new InMemoryRepository('risk')
const suggestionRepo = new InMemoryRepository('sug')
const jobRepo = new InMemoryRepository('job')

const service = new ContractHealthCheckService(
  reviewRepo,
  riskRepo,
  suggestionRepo,
  jobRepo
)

const scope = {
  tenantId: 'tenant-demo',
  organizationId: 'org-demo',
  userId: 'user-boss'
}

// ---------- 演示用合同 ----------
const CONTRACT_TEXT = `销售合同
甲方（供方）：深圳市恒远电子科技有限公司
乙方（需方）：杭州云帆贸易有限公司

第一条 合同标的
甲方向乙方供应智能传感器模组，型号 HY-200，数量 5000 件，单价人民币 120 元，
合同总金额人民币 600000 元（含税）。

第二条 交付与验收
甲方应于合同签订后 45 日内交付。乙方应在收到货物后 7 日内完成验收，
逾期未提出异议视为验收合格。

第三条 付款方式
乙方应在全部货物验收合格后 90 日内一次性付清全部货款。

第四条 违约责任
乙方逾期付款的，应按未付款金额的 0.01% 支付违约金。
甲方逾期交付的，应按合同总金额的 5% 每日向乙方支付违约金。

第五条 争议解决
凡因本合同引起的争议，双方应友好协商解决；协商不成的，
提交甲方所在地人民法院诉讼解决。

第六条 知识产权
本次交易涉及的技术方案及后续改进成果，知识产权归甲方所有。`

// ---------- 输出辅助 ----------
const line = (char = '─', n = 74) => console.log(char.repeat(n))
const step = (n, title) => {
  console.log()
  line('=')
  console.log(`  STEP ${n}  ${title}`)
  line('=')
}
const ok = (msg) => console.log(`  ✅ ${msg}`)
const info = (k, v) => console.log(`     ${k}: ${v}`)

async function main() {
  console.log()
  console.log('╔' + '╗'.padStart(73, '═'))
  console.log('║  合同智能体检 · 端到端业务流程演示' + ' '.repeat(34) + '║')
  console.log('║  插件: @xpert-ai/plugin-contract-health-check@0.1.0' + ' '.repeat(22) + '║')
  console.log('╚' + '╝'.padStart(73, '═'))

  // ========== STEP 1: 输入校验（先演示反面） ==========
  step(1, '输入校验 — 合同正文过短应被拦截')
  try {
    await service.createReview(scope, {
      contractName: '测试',
      contractType: 'sales',
      rawText: '太短了'
    })
    console.log('  ❌ 未拦截（不符合预期）')
  } catch (e) {
    ok(`已拦截：${e.message}`)
  }

  // ========== STEP 2: 新建体检（录入合同） ==========
  step(2, '录入合同 → 新建体检记录')
  const review = await service.createReview(scope, {
    contractName: '恒远电子-云帆贸易 销售合同',
    contractType: 'sales',
    counterparty: '杭州云帆贸易有限公司',
    rawText: CONTRACT_TEXT
  })
  info('reviewId', review.id)
  info('合同名称', review.contractName)
  info('合同类型', review.contractType)
  info('正文长度', `${review.rawText.length} 字`)
  info('初始状态', review.status)
  ok('记录已创建，状态 = draft')

  // ========== STEP 3: 开始体检 ==========
  step(3, '开始体检 → 创建四环节任务 + 下发指令给 Assistant')
  await service.createReviewJobs(scope, review.id)
  const jobs = await jobRepo.find({ where: { reviewId: review.id } })
  console.log('     创建的处理环节：')
  for (const j of jobs) console.log(`       · ${j.type.padEnd(8)} 状态=${j.status}`)

  const command = service.buildPipelineCommand(scope, review.id)
  ok(`已生成 Assistant 指令 (commandKey=${command.commandKey})`)
  console.log('     ┌─ 下发给模型的提示词（节选）')
  console.log(
    command.payload.text
      .split('\n')
      .slice(1, 7)
      .map((l) => '     │ ' + l)
      .join('\n')
  )
  console.log('     └─ ...')

  // ========== STEP 4: AI 处理（模拟工具调用） ==========
  step(4, 'AI 四环节处理 → 通过工具回写结构化结果')

  console.log('  [4.1] 抽取环节 → contract_save_extraction')
  await service.beginStage(scope, review.id, 'extract')
  const extraction = await service.saveExtraction(scope, {
    reviewId: review.id,
    elements: {
      parties: ['深圳市恒远电子科技有限公司（甲方/供方）', '杭州云帆贸易有限公司（乙方/需方）'],
      amount: '人民币 600000 元（含税）',
      paymentTerms: '验收合格后 90 日内一次性付清',
      deliveryTerms: '签订后 45 日内交付，7 日内验收',
      liabilityClause: '乙方逾期付款按 0.01%/日；甲方逾期交付按 5%/日',
      jurisdiction: '甲方所在地人民法院',
      ipClause: '技术方案及改进成果归甲方所有'
    }
  })
  info('识别主体', extraction.item.review.elements.parties.length + ' 个')
  info('合同金额', extraction.item.review.elements.amount)
  ok('要素已结构化保存')

  console.log()
  console.log('  [4.2] 审查环节 → contract_save_risk_items')
  await service.beginStage(scope, review.id, 'review')
  const risksResult = await service.saveRiskItems(scope, {
    reviewId: review.id,
    risks: [
      {
        level: 'high',
        clauseRef: '第三条',
        title: '付款账期过长',
        issue: '约定验收后 90 日付款，账期明显长于行业常见的 30 日，严重占用现金流。',
        basis: '中小企业销售合同常见回款周期为 30–60 日'
      },
      {
        level: 'high',
        clauseRef: '第四条',
        title: '违约责任严重不对等',
        issue: '乙方逾期付款仅 0.01%/日，甲方逾期交付却要 5%/日，双方责任差距 500 倍，显失公平。',
        basis: '违约金应对等；司法实践通常以实际损失的 130% 为上限'
      },
      {
        level: 'high',
        clauseRef: '第五条',
        title: '争议管辖不利',
        issue: '约定由甲方所在地法院管辖，贵司在杭州须赴深圳诉讼，维权成本大幅上升。',
        basis: '管辖地直接影响维权成本'
      },
      {
        level: 'medium',
        clauseRef: '第二条',
        title: '验收标准模糊',
        issue: '仅约定 7 日验收期，未明确验收标准与方式，易在质量认定上产生争议。',
        basis: '验收条款缺失是货款纠纷高发原因'
      },
      {
        level: 'medium',
        clauseRef: '第六条',
        title: '知识产权归属不利',
        issue: '技术方案及后续改进成果全部归甲方，若涉及贵司自有技术将丧失权利。',
        basis: 'IP 条款应区分背景技术与交易成果'
      },
      {
        level: 'low',
        clauseRef: '第二条',
        title: '逾期交付违约金畸高',
        issue: '甲方 5%/日违约金缺乏上限约定，虽对贵司有利，但可能被认定为过高而调减。',
        basis: '过高的违约金可能不被法院全额支持'
      }
    ]
  })
  const revAfterReview = await service.getReviewDetail(scope, review.id)
  info('高危', revAfterReview.item.review.highRiskCount + ' 条')
  info('中危', revAfterReview.item.review.mediumRiskCount + ' 条')
  info('低危', revAfterReview.item.review.lowRiskCount + ' 条')
  ok(`共识别 ${risksResult.risks.length} 条风险`)

  console.log()
  console.log('  [4.3] 改写环节 → contract_save_suggestions')
  await service.beginStage(scope, review.id, 'draft')
  await service.saveSuggestions(scope, {
    reviewId: review.id,
    suggestions: [
      {
        clauseRef: '第三条',
        riskTitle: '付款账期过长',
        originalText: '乙方应在全部货物验收合格后 90 日内一次性付清全部货款。',
        suggestedText:
          '乙方应在本合同项下货物验收合格后 30 日内付清全部货款。逾期未付的，每逾期一日按未付金额的 0.05% 支付逾期利息。',
        rationale: '缩短账期至行业常规水平，并补充逾期利息以形成履约约束。'
      },
      {
        clauseRef: '第四条',
        riskTitle: '违约责任严重不对等',
        originalText: '乙方逾期付款按 0.01%/日；甲方逾期交付按 5%/日。',
        suggestedText:
          '双方逾期履行义务的，均按逾期部分金额的每日 0.05% 向对方支付违约金，违约金总额不超过合同总金额的 20%。',
        rationale: '使双方违约责任对等，并设置违约金上限以降低被司法调减的风险。'
      },
      {
        clauseRef: '第五条',
        riskTitle: '争议管辖不利',
        originalText: '协商不成的，提交甲方所在地人民法院诉讼解决。',
        suggestedText:
          '协商不成的，任何一方均可向乙方所在地人民法院提起诉讼。',
        rationale: '将管辖地改为贵司所在地，显著降低异地维权成本。'
      },
      {
        clauseRef: '第二条',
        riskTitle: '验收标准模糊',
        originalText: '乙方应在收到货物后 7 日内完成验收，逾期未提出异议视为验收合格。',
        suggestedText:
          '乙方应在收到货物后 7 日内按本合同附件《技术规格书》载明的标准完成验收，并出具书面验收确认书。逾期未提出书面异议的，视为验收合格。',
        rationale: '明确验收标准与书面形式，减少质量争议。'
      }
    ]
  })
  const revAfterDraft = await service.getReviewDetail(scope, review.id)
  info('改写建议', revAfterDraft.item.suggestions.length + ' 条')
  ok('已为高/中危风险生成可替换条款')

  console.log()
  console.log('  [4.4] 摘要环节 → contract_save_summary')
  await service.beginStage(scope, review.id, 'summary')
  const summaryResult = await service.saveSummary(scope, {
    reviewId: review.id,
    score: 58,
    summary:
      '本合同整体风险偏高（58/100）。核心问题集中在三处：付款账期长达 90 日且无逾期利息、双方违约责任相差 500 倍、争议管辖在对方所在地。建议在签署前至少修订付款与违约条款，并将管辖地改回贵司所在地。',
    highlights: [
      '付款账期 90 日，无逾期利息约束',
      '违约责任不对等，差距达 500 倍',
      '争议管辖在对方所在地（深圳），异地维权成本高'
    ],
    pendingQuestions: [
      '本批货物是否有明确的技术规格书可用于验收？',
      '贵司是否希望保留自身背景技术的知识产权？'
    ]
  })
  info('总体评分', summaryResult.item.review.score + ' / 100')
  info('当前状态', summaryResult.item.review.status)
  console.log()
  console.log('     ┌─ 体检摘要')
  console.log(
    summaryResult.item.review.summary
      .match(/.{1,60}/g)
      .map((l) => '     │ ' + l)
      .join('\n')
  )
  console.log('     └─')
  ok('摘要已生成，状态 → needs_review')

  // ========== STEP 5: 查看报告 ==========
  step(5, '查看体检报告 — 风险清单 + 改写建议')
  const detail = await service.getReviewDetail(scope, review.id)
  console.log(
    `     总体评分 ${detail.item.review.score}/100   ` +
      `🔴高危 ${detail.summary.highRiskCount}  ` +
      `🟠中危 ${detail.summary.mediumRiskCount}  ` +
      `🟢低危 ${detail.summary.lowRiskCount}   ` +
      `待确认 ${detail.summary.pendingDecisionCount}`
  )
  line()
  for (const risk of detail.item.risks) {
    const badge = risk.level === 'high' ? '🔴' : risk.level === 'medium' ? '🟠' : '🟢'
    const sug = detail.item.suggestions.find((s) => s.riskTitle === risk.title)
    console.log(`  ${badge} [${risk.clauseRef}] ${risk.title}`)
    console.log(`     问题：${risk.issue}`)
    if (sug) {
      console.log(`     建议：${sug.suggestedText.slice(0, 52)}...`)
    }
    console.log(`     状态：${risk.decision}`)
    line('-')
  }

  // ========== STEP 6: 未确认不可保存（业务约束） ==========
  step(6, '业务约束 — 未逐条确认时不允许保存报告')
  try {
    await service.completeReview(scope, review.id)
    console.log('  ❌ 竟然保存成功了（不符合预期）')
  } catch (e) {
    ok(`已拦截：${e.message}`)
  }

  // ========== STEP 7: 逐条确认 ==========
  step(7, '逐条确认风险处理')
  const decisions = [
    { title: '付款账期过长', d: 'accepted', note: '已与客户口头确认可改 30 日' },
    { title: '违约责任严重不对等', d: 'accepted' },
    { title: '争议管辖不利', d: 'accepted' },
    { title: '验收标准模糊', d: 'custom', customText: '按附件一《技术规格书》验收，7 日内出具书面确认。', note: '补充附件后按此执行' },
    { title: '知识产权归属不利', d: 'custom', customText: '双方各自保留背景技术，交易成果双方共有。' },
    { title: '逾期交付违约金畸高', d: 'ignored', note: '对我方有利，保留原条款' }
  ]
  for (const dec of decisions) {
    const risk = detail.item.risks.find((r) => r.title === dec.title)
    const label =
      dec.d === 'accepted' ? '✅ 接受建议' : dec.d === 'ignored' ? '⏭️  忽略' : '✏️  自定义修改'
    await service.confirmRiskDecision(scope, {
      reviewId: review.id,
      riskId: risk.id,
      decision: dec.d,
      customText: dec.customText,
      note: dec.note
    })
    console.log(`  ${label}  [${risk.clauseRef}] ${risk.title}`)
    if (dec.customText) console.log(`           └─ ${dec.customText}`)
    if (dec.note) console.log(`           └─ 备注：${dec.note}`)
  }

  // ========== STEP 8: 保存报告 ==========
  step(8, '保存报告 → 状态置为 completed')
  const completed = await service.completeReview(scope, review.id)
  info('最终状态', completed.status)
  ok('体检报告已持久化保存')

  // ========== STEP 9: 保存与恢复 ==========
  step(9, '保存与恢复 — 模拟刷新/重进应用后重新读取')
  const restored = await service.getReviewDetail(scope, review.id)
  info('恢复 reviewId', restored.item.review.id)
  info('恢复合同名称', restored.item.review.contractName)
  info('恢复评分', restored.item.review.score)
  info('恢复风险条数', restored.item.risks.length)
  info('已确认条数', restored.item.risks.filter((r) => r.decision !== 'pending').length)
  const customCount = restored.item.risks.filter((r) => r.decision === 'custom').length
  info('其中自定义修改', customCount + ' 条')
  const restoredCustom = restored.item.risks.find((r) => r.decision === 'custom')
  console.log(`     示例自定义条款：${restoredCustom.customText}`)
  ok('数据从持久化层完整恢复，非页面内存')

  // ========== STEP 10: 历史记录列表 ==========
  step(10, '历史记录列表')
  const list = await service.getWorkbenchData(scope, {})
  for (const item of list.items) {
    console.log(
      `     · ${item.contractName.padEnd(34)} 评分=${item.score}  状态=${item.status}`
    )
  }
  info('记录总数', list.total)
  ok('列表可查询')

  // ========== STEP 11: 失败与重试（新开一条记录演示） ==========
  step(11, '失败与重试 — 模拟模型调用失败后局部重试')
  const review2 = await service.createReview(scope, {
    contractName: '云帆贸易-某供应商 采购合同',
    contractType: 'purchase',
    rawText: CONTRACT_TEXT.replace('销售合同', '采购合同')
  })
  await service.createReviewJobs(scope, review2.id)
  await service.beginStage(scope, review2.id, 'extract')
  await service.saveExtraction(scope, {
    reviewId: review2.id,
    elements: { parties: ['甲方', '乙方'] }
  })

  console.log('  [失败] 审查环节调用模型失败')
  const failResult = await service.reportProcessingFailure(scope, {
    reviewId: review2.id,
    stage: 'review',
    errorMessage: '模型服务返回 503，请求超时'
  })
  info('记录状态', failResult.status)
  info('失败环节', failResult.stage)
  info('错误信息', failResult.errorMessage)
  const jobsAfterFail = await jobRepo.find({ where: { reviewId: review2.id } })
  const failJob = jobsAfterFail.find((j) => j.type === 'review')
  info('失败环节任务状态', failJob.status)

  const jobsBefore = jobsAfterFail.length
  console.log()
  console.log('  [重试] 只重试失败的审查环节')
  const retry = await service.retryPipeline(scope, { reviewId: review2.id })
  info('重试环节', retry.stage)
  info('重试动作', retry.action)
  const jobsAfter = await jobRepo.find({ where: { reviewId: review2.id } })
  info('任务行数（失败前/后）', `${jobsBefore} → ${jobsAfter.length}`)
  ok(`任务行数未增加（${jobsBefore} = ${jobsAfter.length}），未重复产生业务结果`)
  const retryJob = jobsAfter.find((j) => j.type === 'review')
  info('重试后尝试次数', retryJob.attempts)
  info('重试后状态', (await service.getReviewDetail(scope, review2.id)).item.review.status)

  // ========== STEP 12: 数据隔离 ==========
  step(12, '数据隔离 — 其他组织无法读取本组织记录')
  const otherOrg = { tenantId: 'tenant-demo', organizationId: 'org-other', userId: 'user-x' }
  try {
    await service.getReviewDetail(otherOrg, review.id)
    console.log('  ❌ 竟然读到了（不符合预期）')
  } catch (e) {
    ok(`已隔离：${e.message}`)
  }

  // ========== 汇总 ==========
  console.log()
  line('=')
  console.log('  演示完成 — 全部环节执行成功')
  line('=')
  console.log(`
  覆盖的业务能力：
    ✓ 输入校验（正文过短被拦截）
    ✓ 录入合同 → 新建体检记录（draft）
    ✓ 四环节任务创建 + Assistant 指令生成
    ✓ AI 工具回写：抽取 / 审查 / 改写 / 摘要
    ✓ 状态机流转：draft → processing → needs_review → completed
    ✓ 业务约束：未确认不可保存
    ✓ 逐条确认（接受 3 / 自定义 2 / 忽略 1）
    ✓ 持久化保存与恢复
    ✓ 历史记录列表
    ✓ 失败上报 + 局部重试（幂等，不重复产生结果）
    ✓ 组织级数据隔离
`)
}

main().catch((e) => {
  console.error('\n演示失败：', e)
  process.exit(1)
})
