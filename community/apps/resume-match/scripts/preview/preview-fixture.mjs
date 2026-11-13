const JOB_TEXT = `岗位职责
1. 负责云原生招聘平台核心服务的设计、开发与稳定性治理。
2. 使用 Python 与 FastAPI 构建高并发业务接口，持续优化接口性能。
3. 负责 PostgreSQL、Redis、消息队列等基础组件的选型与容量规划。
4. 参与服务拆分、领域建模和关键链路的可观测性建设。
5. 与产品、算法和前端团队协作，推动业务需求高质量交付。

任职要求
1. 本科及以上学历，计算机相关专业，6 年以上后端开发经验。
2. 精通 Python，熟悉 FastAPI、Node.js 等主流服务端技术。
3. 熟悉 PostgreSQL、Redis，具备复杂 SQL 与缓存设计经验。
4. 熟悉云服务与容器化部署，有 AWS、Kubernetes 实践经验。
5. 有消息队列、分布式系统和高可用架构经验者优先。
6. 具备良好的系统设计能力和跨团队沟通能力。`

const RESUME_TEXT = `林晓雯，女，1994 年生，现居杭州，求职状态：在职，考虑机会。
手机：138****5621    邮箱：lin.xiaowen@example.cn

教育背景
2012.09-2016.06  浙江工业大学  计算机科学与技术  本科

工作经历
2021.03-至今  云帆科技  高级后端工程师
负责招聘业务中台的服务端架构与核心接口，服务日均请求量约 800 万。
主导候选人搜索服务重构，将平均响应时间从 420ms 降至 180ms。
使用 Python、FastAPI、PostgreSQL 建设岗位与简历匹配服务，支撑 12 个业务方。
引入 Redis 多级缓存与 Kafka 异步处理，峰值期间接口可用性保持在 99.98%。
推动服务容器化并迁移至 AWS EKS，建立灰度发布与链路追踪机制。
带领 3 人小组完成服务拆分，制定接口规范和代码评审流程。

2018.07-2021.02  星澜网络  后端工程师
参与电商订单系统开发，负责库存、优惠券和履约接口。
使用 Node.js 与 PostgreSQL 重构订单查询链路，降低数据库慢查询数量。
建设 Redis 缓存与消息队列消费服务，支持大促期间的流量削峰。

2016.07-2018.06  明川信息  初级后端工程师
参与企业协同办公系统的接口开发与运维。
编写 Python 数据处理脚本，负责日志分析与异常告警。

项目经历
招聘搜索与匹配平台（2022.05-2024.12）
担任后端负责人，完成岗位画像、简历解析结果存储、检索与排序接口。
设计分页与游标查询方案，支撑千万级候选人数据的稳定检索。
建立压测基线，核心接口 P95 延迟稳定在 220ms 以内。

技能
Python、FastAPI、Node.js、PostgreSQL、Redis、Kafka、AWS、Docker、Kubernetes、系统设计。
英语可作为工作语言。`

function result(scores, extra = {}) {
  const overall = Math.round(
    scores.skills * 0.45 + scores.experience * 0.3 + scores.domain * 0.2 + scores.education * 0.05
  )
  return {
    schemaVersion: 1,
    overallScore: overall,
    level: overall >= 85 ? '高度匹配' : overall >= 70 ? '较好匹配' : overall >= 55 ? '基本匹配' : '匹配度较低',
    dimensions: [
      { key: 'skills', label: '专业技能', score: scores.skills, summary: extra.skillsSummary || '技术栈与岗位要求高度重合，核心后端能力有连续项目证据。' },
      { key: 'experience', label: '工作经验', score: scores.experience, summary: extra.experienceSummary || '六年后端经验覆盖高并发接口、稳定性治理和跨团队协作，项目复杂度与岗位要求接近。' },
      { key: 'domain', label: '行业与领域', score: scores.domain, summary: extra.domainSummary || '长期在招聘与电商业务中负责服务端核心链路，对业务建模和平台化建设有直接经验。' },
      { key: 'education', label: '教育背景', score: scores.education, summary: extra.educationSummary || '计算机科学与技术本科，学历与专业满足岗位基本要求。' }
    ],
    matchedSkills: extra.matchedSkills || [
      { name: '接口开发', score: 100 },
      { name: '后端框架', score: 100 },
      { name: '关系型数据库', score: 100 },
      { name: '云服务', score: 90 },
      { name: '消息队列', score: 80 },
      { name: '服务端运行环境', score: 70 },
      { name: '缓存设计', score: 100 },
      { name: '容器化', score: 100 },
      { name: '系统设计', score: 80 },
      { name: '容器编排', score: 60 }
    ],
    missingSkills: extra.missingSkills || ['大规模团队管理', '多地域容灾演练'],
    highlights: extra.highlights || [
      'Python、FastAPI、PostgreSQL 与岗位核心技术栈高度重合。',
      '有招聘搜索与匹配平台的后端负责人经历，业务场景直接相关。',
      '主导搜索服务重构，将平均响应时间从 420ms 降至 180ms。',
      '使用 Redis、Kafka 与 AWS EKS 支撑高并发链路，具备稳定性治理经验。',
      '带领 3 人小组完成服务拆分，具备系统设计与跨团队协作能力。'
    ],
    risks: extra.risks || [
      '简历未体现大规模团队管理经验，需要在面试中确认管理范围。',
      '容器编排仅体现平台使用，未说明集群治理和故障演练深度。',
      '岗位要求 6 年以上经验，候选人工作年限刚好达到边界，需核实项目主导程度。'
    ],
    summary: extra.summary || '候选人与岗位高度匹配。核心后端技术栈、招聘业务场景、高并发接口与稳定性治理经历均有明确证据，能够较快承接岗位职责。主要差距在团队管理和管理复杂度，建议进入面试重点核实。',
    recommendation: extra.recommendation || '建议进入面试，重点核实团队管理范围、容器集群治理深度和跨团队推进案例。'
  }
}

function analysis(overrides) {
  const match = result(overrides.scores || { skills: 96, experience: 90, domain: 88, education: 75 }, overrides.result || {})
  return {
    id: overrides.id,
    candidateName: overrides.candidateName,
    candidateTitle: overrides.candidateTitle || '高级后端工程师',
    candidateYears: overrides.candidateYears ?? 6,
    candidateCity: overrides.candidateCity || '杭州',
    candidatePhone: overrides.candidatePhone || '138****5621',
    candidateEmail: overrides.candidateEmail || 'lin.xiaowen@example.cn',
    jobTitle: overrides.jobTitle || '高级后端工程师',
    company: overrides.company || '云帆科技',
    jobCity: overrides.jobCity || '杭州',
    salary: overrides.salary || '25-40K·14薪',
    jobText: overrides.jobText || JOB_TEXT,
    resumeText: overrides.resumeText || RESUME_TEXT,
    status: overrides.status || 'review',
    score: match.overallScore,
    level: match.level,
    result: match,
    revision: overrides.revision ?? 3,
    attempt: overrides.attempt ?? 1,
    updatedAt: overrides.updatedAt || '2026-04-18T10:24:00+08:00',
    createdAt: overrides.createdAt || '2026-04-18T10:22:00+08:00',
    humanDecision: overrides.humanDecision,
    humanScore: overrides.humanScore,
    humanConclusion: overrides.humanConclusion,
    reviewedAt: overrides.reviewedAt,
    errorMessage: overrides.errorMessage
  }
}

function baseAnalyses() {
  return [
    analysis({
      id: 'e7f6f8b1-0e84-4bca-8d12-9b2d4a8f6c11',
      candidateName: '林晓雯',
      candidateTitle: '高级后端工程师',
      scores: { skills: 96, experience: 90, domain: 88, education: 75 }
    }),
    analysis({
      id: 'a6d8d9c2-7a54-4b9e-b58e-1d8c7e3f2a22',
      candidateName: '周启明',
      candidateTitle: '后端工程师',
      candidateYears: 5,
      candidatePhone: '139****7712',
      candidateEmail: 'zhou.qiming@example.cn',
      status: 'confirmed',
      revision: 5,
      humanDecision: '进入面试',
      humanScore: 87,
      humanConclusion: '技术栈匹配，项目深度足够，安排一面重点聊服务治理。',
      reviewedAt: '2026-04-17T16:40:00+08:00',
      updatedAt: '2026-04-17T16:40:00+08:00',
      createdAt: '2026-04-17T16:21:00+08:00',
      scores: { skills: 90, experience: 88, domain: 84, education: 76 },
      result: {
        highlights: [
          '具备 Python 与 PostgreSQL 的连续项目经验。',
          '有订单与履约链路的高并发处理经历。',
          '参与过服务拆分和接口治理。',
          '熟悉 Redis 缓存与异步消息处理。',
          '本科为软件工程，专业对口。'
        ],
        risks: ['跨团队协作案例较少，需要在面试中补充。'],
        summary: '整体匹配度较好，核心后端能力满足岗位要求，复杂系统设计证据略少于第一位候选人。',
        recommendation: '建议进入面试，重点了解服务治理和跨团队协作。'
      }
    }),
    analysis({
      id: 'c9a1e4d3-2b67-4f80-9c43-5e8f1a7b3c33',
      candidateName: '苏婉宁',
      candidateTitle: '服务端工程师',
      candidateYears: 4,
      candidatePhone: '136****9088',
      candidateEmail: 'su.wanning@example.cn',
      scores: { skills: 86, experience: 85, domain: 82, education: 78 },
      revision: 2,
      updatedAt: '2026-04-16T14:08:00+08:00',
      createdAt: '2026-04-16T14:05:00+08:00',
      result: {
        highlights: [
          '熟悉 Python 与 FastAPI，接口开发经验完整。',
          '有招聘业务的服务端开发经历。',
          '使用 Redis 优化过热点查询。',
          '参与容器化部署与日志治理。',
          '沟通表达清晰，项目描述具体。'
        ],
        risks: ['工作年限略低于岗位要求，需确认独立负责范围。', '大规模流量治理证据有限。'],
        summary: '基本匹配，具备岗位所需的核心开发能力，但复杂系统与高并发治理经验仍需进一步确认。',
        recommendation: '建议先做技术初筛，再决定是否进入正式面试。'
      }
    })
  ]
}

export function createScenario(name) {
  if (name === 'empty') {
    return { analyses: [], selectedId: null }
  }
  const analyses = baseAnalyses()
  if (name === 'waiting') {
    analyses[0] = {
      ...analyses[0],
      status: 'waiting_ai',
      result: undefined,
      score: undefined,
      level: undefined,
      revision: 1
    }
  }
  if (name === 'failure') {
    analyses[0] = {
      ...analyses[0],
      status: 'failed',
      errorMessage: '分析模型在生成结构化结果时超时，已保留本轮材料。',
      revision: 4
    }
  }
  if (name === 'confirmed') {
    analyses[0] = {
      ...analyses[0],
      status: 'confirmed',
      revision: 5,
      humanDecision: '进入面试',
      humanScore: 92,
      humanConclusion: '核心能力与业务场景匹配，安排技术一面。',
      reviewedAt: '2026-04-18T10:32:00+08:00'
    }
  }
  return { analyses, selectedId: analyses[0].id }
}

export function getViewData(state, query) {
  const items = state.analyses.map((item) => ({
    id: item.id,
    candidateName: item.candidateName,
    candidateTitle: item.candidateTitle,
    candidateYears: item.candidateYears,
    jobTitle: item.jobTitle,
    company: item.company,
    jobCity: item.jobCity,
    salary: item.salary,
    status: item.status,
    score: item.score,
    level: item.level,
    revision: item.revision,
    attempt: item.attempt,
    updatedAt: item.updatedAt,
    createdAt: item.createdAt
  }))
  const selected =
    state.analyses.find((item) => item.id === query.selectionId) ||
    state.analyses.find((item) => item.id === state.selectedId) ||
    state.analyses[0] ||
    null
  return {
    items,
    selected,
    total: items.length,
    query: { page: 1, pageSize: 20 }
  }
}

export function applyAction(state, actionKey, input) {
  if (actionKey === 'prepare_analysis') {
    if (!input.candidateName || !input.jobTitle || String(input.jobText || '').trim().length < 40 || String(input.resumeText || '').trim().length < 40) {
      return { ok: false, message: '请补全必填项，岗位说明与简历至少需要 40 个字。' }
    }
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    const record = analysis({
      id,
      candidateName: input.candidateName,
      candidateTitle: input.candidateTitle,
      candidateYears: input.candidateYears,
      candidateCity: input.candidateCity,
      candidatePhone: input.candidatePhone,
      candidateEmail: input.candidateEmail,
      jobTitle: input.jobTitle,
      company: input.company,
      jobCity: input.jobCity,
      salary: input.salary,
      jobText: input.jobText,
      resumeText: input.resumeText,
      status: 'waiting_ai',
      revision: 1,
      updatedAt: createdAt,
      createdAt
    })
    record.result = result({ skills: 91, experience: 88, domain: 86, education: 76 }, {
      summary: '候选人的核心技能与岗位要求匹配，具备相关业务场景经验，建议结合项目深度做进一步核实。',
      recommendation: '建议进入面试，重点核实项目主导程度与复杂系统治理经验。'
    })
    record.score = record.result.overallScore
    record.level = record.result.level
    return {
      ok: true,
      state: { analyses: [record, ...state.analyses], selectedId: id },
      analysisId: id,
      message: '分析任务已创建',
      previewResult: null,
      data: {
        analysisId: id,
        commandKey: 'assistant.chat.send_message',
        payload: { text: makeAssistantPrompt(record) }
      }
    }
  }
  if (actionKey === 'retry_analysis') {
    const record = state.analyses.find((item) => item.id === input.analysisId)
    if (!record) return { ok: false, message: '未找到分析记录。' }
    if (record.status === 'confirmed') return { ok: false, message: '已确认记录不能重新分析。' }
    const next = { ...record, status: 'waiting_ai', attempt: record.attempt + 1, revision: record.revision + 1, errorMessage: undefined, updatedAt: new Date().toISOString() }
    return {
      ok: true,
      state: { ...state, analyses: state.analyses.map((item) => (item.id === record.id ? next : item)), selectedId: record.id },
      analysisId: record.id,
      message: '已重新发起分析',
      data: {
        analysisId: record.id,
        commandKey: 'assistant.chat.send_message',
        payload: { text: makeAssistantPrompt(next) }
      }
    }
  }
  if (actionKey === 'confirm_analysis') {
    const record = state.analyses.find((item) => item.id === input.analysisId)
    if (!record) return { ok: false, message: '未找到分析记录。' }
    if (record.revision !== input.expectedRevision) return { ok: false, message: '记录已更新，请刷新后重试。' }
    const next = {
      ...record,
      status: 'confirmed',
      humanDecision: input.humanDecision,
      humanScore: input.humanScore,
      humanConclusion: input.humanConclusion,
      reviewedAt: new Date().toISOString(),
      revision: record.revision + 1,
      updatedAt: new Date().toISOString()
    }
    return {
      ok: true,
      state: { ...state, analyses: state.analyses.map((item) => (item.id === record.id ? next : item)), selectedId: record.id },
      message: '人工结论已保存',
      data: { analysisId: record.id, revision: next.revision }
    }
  }
  return { ok: false, message: '不支持的操作。' }
}

export function makeAssistantPrompt(record) {
  return `请完成一条简历与岗位的智能匹配分析。分析记录编号：${record.id}，分析轮次：${record.attempt}。请先调用读取工具，再调用保存工具写入工作台，等待人工确认。`
}
