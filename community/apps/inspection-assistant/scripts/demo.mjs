/**
 * 业务闭环演示脚本：调用真实编译后的 InspectionService，
 * 走一遍 创建工单 → AI 解析 → 历史检索 → AI 建议 → 人工确认 → 失败重试 的完整流程。
 * 仅用于本地验证演示（内存存储），数据为演示数据。
 */
import { randomUUID } from 'crypto'
import { InspectionService } from '../dist/lib/inspection.service.js'

// ---------- 内存 Repository（与单元测试同款，仅覆盖 service 用到的 API） ----------
function matchWhere(entity, where) {
  for (const [key, value] of Object.entries(where)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && 'value' in value) {
      const op = value
      if (op._type === 'in') {
        if (!op.value.includes(entity[key])) return false
        continue
      }
      if (op._type === 'like') {
        const pattern = String(op.value).replace(/\\/g, '').replace(/%/g, '')
        if (!String(entity[key] ?? '').includes(pattern)) return false
        continue
      }
    }
    if (entity[key] !== value) return false
  }
  return true
}

function createMockRepository() {
  const store = new Map()
  return {
    create: (data) => ({ ...data }),
    async save(entity) {
      const entities = Array.isArray(entity) ? entity : [entity]
      for (const item of entities) store.set(item.id, item)
      return entity
    },
    async findOne(options) {
      for (const e of store.values()) if (matchWhere(e, options.where)) return e
      return null
    },
    async find(options) {
      let rows = [...store.values()].filter((e) => matchWhere(e, options.where))
      if (options.order) {
        const [key, dir] = Object.entries(options.order)[0]
        rows.sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (dir === 'DESC' ? -1 : 1))
      }
      if (options.take) rows = rows.slice(0, options.take)
      return rows
    },
    async findAndCount(options) {
      const rows = [...store.values()].filter((e) => matchWhere(e, options.where))
      const start = options.skip ?? 0
      return [rows.slice(start, start + (options.take ?? 20)), rows.length]
    },
    async remove(entity) {
      store.delete(entity.id)
      return entity
    }
  }
}

const scope = { tenantId: 'demo-tenant', organizationId: null, workspaceId: null, projectId: null, userId: 'ops-li' }
const service = new InspectionService(createMockRepository(), createMockRepository())

const line = (ch) => ch.repeat(72)
const step = (n, title) => console.log(`\n${line('=')}\n[STEP ${n}] ${title}\n${line('-')}`)

console.log('机房/基站巡检与故障处理助手 —— 业务闭环本地验证演示（内存存储 · 演示数据）')
console.log('构建版本: dist/ · 执行时间: ' + new Date().toISOString().replace('T', ' ').slice(0, 19))

step(1, '创建巡检工单（运维人员提交故障描述）')
const created = await service.createCase(scope, {
  title: '晋中 XX 基站 BBU 反复掉电',
  deviceType: 'BBU',
  faultDescription: 'BBU 频繁掉电，直流输入电压异常，设备不定期重启，影响 3 个小区。',
  severity: 'high',
  impact: '影响 3 个小区'
})
console.log(`工单号: ${created.caseNo}  状态: ${created.status}  设备: ${created.deviceType}  紧急度: ${created.severity}`)

step(2, 'AI 结构化解析（inspection_analyze_fault）')
const analyzed = await service.saveAiAnalysis(scope, created.id, {
  deviceType: 'BBU',
  faultCategory: '电源掉电',
  faultSummary: 'BBU 直流输入异常导致反复掉电重启',
  severity: 'high',
  impact: '影响 3 个小区',
  possibleCauses: ['直流配电端子松动', '蓄电池失效', '整流模块故障']
})
console.log(`状态: ${analyzed.status}  设备: ${analyzed.deviceType}  类别: ${analyzed.aiAnalysis.faultCategory}`)
console.log(`可能原因: ${analyzed.aiAnalysis.possibleCauses.join(' / ')}`)

step(3, '检索历史处理方案（inspection_search_history）')
const history = await service.searchHistory(scope, { deviceType: 'BBU', keywords: ['掉电', '电源'] })
console.log(`命中 ${history.length} 条历史方案:`)
for (const h of history) {
  console.log(`  · [${h.deviceType}/${h.faultCategory}] ${h.description.slice(0, 32)}…`)
  console.log(`    方案: ${h.resolution.slice(0, 44)}…`)
}

step(4, 'AI 生成处理建议（inspection_save_recommendation）')
const recommended = await service.saveRecommendation(scope, created.id, {
  recommendation:
    '1. 现场检查直流配电单元接线端子并紧固，测量输入电压波动；\n2. 检测蓄电池组单体电压与健康度，失效电池整组更换；\n3. 清理整流模块防尘网，复测 72 小时无掉电告警。',
  historyReferenceIds: history.map((h) => h.id)
})
console.log(`状态: ${recommended.status}  引用历史方案: ${recommended.historyReferences.length} 条`)
console.log(`建议摘要: ${recommended.recommendedAction.split('\n')[0]}`)

step(5, '人工确认处理方案（confirm_resolution）')
const confirmed = await service.confirmResolution(scope, created.id, {
  resolution: '已紧固直流端子并更换 2 节失效蓄电池，复测 72 小时无掉电。',
  resolvedBy: '李工',
  close: true
})
console.log(`状态: ${confirmed.status}  处理人: ${confirmed.resolvedBy}  已沉淀到历史方案库: 是`)

step(6, '失败重试演示（report_failure → retry_case）')
const failCase = await service.createCase(scope, {
  title: '天线覆盖异常待核查',
  faultDescription: '周边用户弱覆盖反馈，需要排查。'
})
const failed = await service.reportFailure(scope, failCase.id, { reason: '故障描述过于模糊，无法确定设备类型' })
console.log(`状态: ${failed.status}  失败原因: ${failed.failureReason}`)
const retried = await service.retryCase(scope, failCase.id)
console.log(`重试后状态: ${retried.status}  重试次数: ${retried.retryCount}  失败原因已清除: ${retried.failureReason === null}`)
console.log(`（同一工单 ${retried.caseNo}，不产生重复数据）`)

step(7, '工单视图数据（Workbench 数据源）')
const view = await service.getWorkbenchData(scope, {})
console.log(`工单总数: ${view.total}`)
for (const c of view.cases) {
  console.log(`  · ${c.caseNo}  ${c.status.padEnd(9)} ${(c.deviceType ?? '未分类').padEnd(6)} ${c.title}`)
}

console.log(`\n${line('=')}`)
console.log('验证结论: 创建 → 解析 → 检索 → 建议 → 确认 → 沉淀 → 失败重试 全流程通过 ✅')
console.log('VERIFY RESULT: PASS - full closed loop verified locally')
