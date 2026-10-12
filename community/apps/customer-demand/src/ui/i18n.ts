const zh = {
 title: '客户需求评估与跟进', subtitle: '把零散沟通变成清晰的下一步', new: '新建需求', refresh: '刷新',
 search: '搜索客户或需求', all: '全部状态', empty: '还没有客户需求', emptyHint: '新建一条需求，粘贴客户沟通记录，开始第一次评估。',
 choose: '选择一条需求', chooseHint: '查看客户原文、Jev 建议和你的跟进决定。',
 customer: '客户名称', demandTitle: '需求标题', source: '客户沟通原文', sourceHint: '保留客户原话，包括目标、预算、时间和决策人。',
 save: '保存需求', saveEdit: '保存修改', cancel: '取消', edit: '修改原文', editHint: '修改原文后，旧评估和跟进决定会失效，需要重新评估。',
 evaluate: '开始 Jev 评估', retry: '重试评估', working: '正在处理…', loading: '正在连接工作台…',
 aiTitle: 'Jev 辅助评估', humanTitle: '我的跟进决定', humanHint: '核对客户原文，可调整建议后保存。保存不会联系客户或承诺报价。',
 category: '需求类型', priority: '跟进优先级', nextStep: '下一步', note: '跟进备注', noteHint: '写下下一步要确认的问题或安排。',
 confirm: '确认并保存', updateDecision: '更新跟进决定', saved: '已保存', sourceSaved: '需求已保存，可以开始评估。',
 assessmentDone: '评估完成，请核对并确认下一步。', confirmed: '已确认',
 completeness: '信息完整度', goal: '业务目标', budget: '预算', timeline: '期望时间', decisionMaker: '决策人',
 known: '原文很可能已说明', missing: '建议补充确认', uncertain: '需要人工核对', probability: '“已说明”的概率',
 confidence: '分类置信度', nextConfidence: '下一步置信度', uncertainHint: '模型判断较不确定，请重点核对原文，不要直接照搬建议。',
 modelDetails: '查看模型判断与评估记录', model: '实际模型', urgency: '紧迫性评分（0–3）', attempts: '评估次数',
 policy: '优先级规则：客户明确暂缓则为低；紧迫性评分≥2 则为高；其余为普通。这是待业务样本校准的初始规则。',
 probabilityHint: '概率反映模型判断，不等于客户事实已经核实。', previous: '上一页', next: '下一页',
 records: '共 {total} 条 · 第 {page} 页', updated: '更新于 {date}', decisionTime: '确认于 {date}',
 draft: '待评估', evaluating: '评估中', review: '待确认', failed: '评估失败',
 miniapp: '小程序', website: '网站', internal_system: '内部业务系统', automation: '流程自动化', other: '其他需求', unclear: '尚不明确',
 high: '高优先级', normal: '普通优先级', low: '低优先级',
 clarify: '补充信息', discovery: '安排需求沟通', solution_review: '进入方案评估', defer: '暂缓跟进',
 failedHint: '原始需求已保存，可以重试；不会重复创建需求。', awaiting: '需求已保存，开始评估后会在这里显示结果。',
 runningHint: '评估尚未结束。可刷新查看；中断超过两分钟后可点击重试。',
 attemptSucceeded: '成功', attemptFailed: '失败', attemptRunning: '处理中',
 invalid_input: '请检查必填项：客户、标题，以及至少 10 字的沟通记录。',
 model_not_configured: '服务端尚未配置 Jev 密钥，请联系管理员。', model_auth_failed: 'Jev 凭证不可用，请联系管理员检查。',
 model_busy: 'Jev 服务繁忙，请稍后重试。', model_timeout: 'Jev 响应超时，请稍后重试。', model_unavailable: '暂时无法完成模型评估，请重试。',
 evaluation_running: '该需求正在评估，请稍后刷新。', revision_conflict: '记录已被更新，请刷新后核对再保存。',
 request_conflict: '该保存请求已被用于其他内容，请重新新建需求。', not_found: '记录不存在，或你没有访问权限。',
 scope_required: '当前工作台缺少有效的组织或用户身份。', assessment_required: '请先完成 Jev 评估，再确认跟进决定。',
 operation_failed: '操作未完成，请刷新后重试。', interrupted: '上次评估被中断', bridge_timeout: '工作台响应超时，请刷新查看保存状态。'
}
export type MessageKey = keyof typeof zh
const en: Record<MessageKey, string> = {
 title: 'Customer demand & follow-up', subtitle: 'Turn scattered conversations into a clear next step', new: 'New request', refresh: 'Refresh',
 search: 'Search customers or requests', all: 'All statuses', empty: 'No customer requests yet', emptyHint: 'Create a request and paste the customer conversation to begin.',
 choose: 'Select a request', chooseHint: 'Review the source, Jev assessment and your follow-up decision.',
 customer: 'Customer', demandTitle: 'Request title', source: 'Customer conversation', sourceHint: 'Preserve the original wording, including goals, budget, timing and decision maker.',
 save: 'Save request', saveEdit: 'Save changes', cancel: 'Cancel', edit: 'Edit source', editHint: 'Editing the source clears the previous assessment and decision. A fresh assessment is required.',
 evaluate: 'Assess with Jev', retry: 'Retry assessment', working: 'Working…', loading: 'Connecting to workbench…',
 aiTitle: 'Jev assessment', humanTitle: 'My follow-up decision', humanHint: 'Review the source and adjust the advice before saving. Saving does not contact customers or promise a quote.',
 category: 'Request type', priority: 'Follow-up priority', nextStep: 'Next step', note: 'Follow-up note', noteHint: 'Record the questions or arrangements to follow up.',
 confirm: 'Confirm and save', updateDecision: 'Update decision', saved: 'Saved', sourceSaved: 'Request saved. You can assess it now.',
 assessmentDone: 'Assessment complete. Review and confirm the next step.', confirmed: 'Confirmed',
 completeness: 'Information completeness', goal: 'Business goal', budget: 'Budget', timeline: 'Expected timing', decisionMaker: 'Decision maker',
 known: 'Likely stated', missing: 'Ask for clarification', uncertain: 'Review needed', probability: 'Probability of being stated',
 confidence: 'Classification confidence', nextConfidence: 'Next-step confidence', uncertainHint: 'The model is uncertain. Carefully review the source before accepting its advice.',
 modelDetails: 'Model results and assessment history', model: 'Resolved model', urgency: 'Urgency score (0–3)', attempts: 'Assessment attempts',
 policy: 'Initial policy: explicit deferral → low; urgency ≥2 → high; otherwise normal. Calibrate these thresholds on representative business examples.',
 probabilityHint: 'Model probabilities do not establish verified customer facts.', previous: 'Previous', next: 'Next',
 records: '{total} requests · Page {page}', updated: 'Updated {date}', decisionTime: 'Confirmed {date}',
 draft: 'Not assessed', evaluating: 'Assessing', review: 'Needs review', failed: 'Assessment failed',
 miniapp: 'Mini app', website: 'Website', internal_system: 'Internal system', automation: 'Automation', other: 'Other', unclear: 'Unclear',
 high: 'High priority', normal: 'Normal priority', low: 'Low priority', clarify: 'Clarify information', discovery: 'Arrange discovery', solution_review: 'Review solution', defer: 'Defer follow-up',
 failedHint: 'Your request is saved. Retrying will not create another request.', awaiting: 'Request saved. Run an assessment to see the results here.',
 runningHint: 'Assessment is still running. Refresh to check it; interrupted attempts can retry after two minutes.',
 attemptSucceeded: 'Succeeded', attemptFailed: 'Failed', attemptRunning: 'Running',
 invalid_input: 'Check the required customer, title, and a conversation of at least 10 characters.', model_not_configured: 'The server has no Jev API key. Contact the administrator.',
 model_auth_failed: 'Jev credentials are invalid. Contact the administrator.', model_busy: 'Jev is busy. Please retry later.', model_timeout: 'Jev timed out. Please retry.',
 model_unavailable: 'The assessment is temporarily unavailable. Please retry.', evaluation_running: 'This request is being assessed. Refresh shortly.',
 revision_conflict: 'The record has changed. Refresh and review it before saving.', request_conflict: 'This save request was used for different content. Start a new request.',
 not_found: 'The record is unavailable or access was denied.', scope_required: 'A valid organization and user context is required.',
 assessment_required: 'Complete the assessment before confirming a decision.', operation_failed: 'The operation failed. Refresh and retry.',
 interrupted: 'The previous attempt was interrupted', bridge_timeout: 'Workbench request timed out. Refresh to check the saved state.'
}
export type Locale = 'zh-Hans' | 'en-US'
export function localeOf(value?: string): Locale { return ['zh-Hans', 'zh_Hans', 'zh-CN', 'zh'].includes(value || '') ? 'zh-Hans' : 'en-US' }
export function i18n(locale: Locale) {
 const catalog = locale === 'zh-Hans' ? zh : en
 return {
  t: (key: MessageKey, values: Record<string, string | number> = {}) => catalog[key].replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? `{${k}}`)),
  error: (code: string) => Object.hasOwn(catalog, code) ? catalog[code as MessageKey] : catalog.operation_failed,
  percent: (n: number) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(n),
  date: (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
 }
}
export const catalogs = { zh, en }
