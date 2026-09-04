const en = {
  recent: 'Recent cases', attention: 'Needs attention', refresh: 'Refresh', loading: 'Loading cases…',
  empty: 'No cases to show', emptyDetail: 'Cases assigned to or handled by this Assistant will appear here when you have Project access.',
  error: 'Unable to load cases.', retry: 'Retry', back: 'Back to cases', previous: 'Previous', next: 'Next',
  simulation: 'Simulation', external: 'External systems', simulationDetail: 'Execution confirmations are simulated. No production systems are controlled.',
  externalDetail: 'External adapters are not configured. Approved work will wait for setup.',
  approve: 'Approve and continue', reject: 'Reject', resume: 'Retry continuation', cancel: 'Cancel', submitting: 'Submitting…',
  confirmApprove: 'Approve this recovery plan?', confirmReject: 'Reject this recovery plan?',
  confirmBody: 'Your decision applies to the displayed revision. Approval schedules execution and a verification Assistant Task in the background.',
  reason: 'Decision notes', reasonHelp: 'Enter at least 8 characters. A rejection reason is required.',
  approvalReason: 'Approve execution of this recovery plan revision.',
  revision: 'Case revision', planRevision: 'Plan revision', plan: 'Recovery plan', scope: 'Execution scope',
  systems: 'MES, CMMS, WMS, AGV, APS, QMS and ERP recovery actions for this case.',
  evidence: 'Evidence', execution: 'Execution', nextAction: 'Next step', latest: 'Latest change',
  handling: 'How to handle', handleApproval: 'Review the current recovery plan, then approve and continue or reject it with a reason.',
  handleRetry: 'Review the interruption reason, then retry the saved continuation. Completed steps will be reused.',
  handleOwner: 'A Project owner or manager must perform this action.',
  handleWorkbench: 'This case has no Profile action at its current stage. Continue the next step in Factory Workbench.',
  binding: 'Coordinator binding needs repair before work can continue.', updated: 'Updated', decisionFailed: 'The decision could not be submitted. Retry reuses the same operation ID.',
  completed: 'Completed', pending: 'Queued', running: 'Running', waiting: 'Awaiting verification', blocked: 'Needs attention', failed: 'Failed',
  statuses: { investigating: 'Investigating', planning: 'Planning', awaiting_approval: 'Awaiting approval', approved: 'Approved', executing: 'Executing', verifying: 'Verifying', recovered: 'Recovered', escalated: 'Escalated', rejected: 'Rejected' },
  severity: { medium: 'Medium', high: 'High', critical: 'Critical' },
  reasons: {
    coordinator_binding_missing: 'The coordinating Assistant binding is missing or has changed.', project_binding_not_ready: 'The Case Project is not ready.',
    external_adapters_unconfigured: 'External system adapters need configuration.', approval_permission_revoked: 'The approver no longer has owner or manager access.',
    approval_version_changed: 'The approved plan version has changed.', case_revision_changed: 'The case changed after approval. Review the latest revision.',
    verification_requires_attention: 'The verification Assistant needs human attention.', verification_evidence_incomplete: 'Verification did not provide the required completion evidence.',
    verification_timeout: 'Verification exceeded its time limit.', execution_requires_attention: 'Execution requires human attention.', new_human_gate: 'The next step requires a human decision.',
    infrastructure_failure: 'A background service is unavailable. Completed steps have been preserved.'
  }
}
type Bundle = typeof en
const zh: Bundle = {
  recent: '最近案件', attention: '待处理', refresh: '刷新', loading: '正在加载案件…', empty: '暂无案件',
  emptyDetail: '当你拥有对应 Project 的读取权限时，此处会展示分配给该 Assistant 或由其参与处理的案件。',
  error: '案件暂时无法加载。', retry: '重试', back: '返回案件', previous: '上一页', next: '下一页', simulation: '模拟模式', external: '外部系统',
  simulationDetail: '执行确认来自模拟，不会控制生产系统。', externalDetail: '外部适配器尚未配置，已批准工作将等待配置完成。',
  approve: '批准并继续', reject: '拒绝', resume: '重试续跑', cancel: '取消', submitting: '正在提交…', confirmApprove: '批准当前恢复方案？', confirmReject: '拒绝当前恢复方案？',
  confirmBody: '决定仅适用于当前显示的版本。批准后将在后台执行方案，并派发恢复验证 Assistant Task。',
  reason: '审批意见', reasonHelp: '请填写至少 8 个字符；拒绝必须填写原因。', approvalReason: '同意执行当前版本的恢复方案。',
  revision: '案件版本', planRevision: '方案版本', plan: '恢复方案', scope: '执行范围', systems: '此案件涉及的 MES、CMMS、WMS、AGV、APS、QMS 和 ERP 恢复动作。',
  evidence: '证据', execution: '执行状态', nextAction: '下一步', latest: '最近变化', handling: '处理方式',
  handleApproval: '审阅当前恢复方案，然后选择“批准并继续”或填写原因后拒绝。', handleRetry: '核对中断原因后重试续跑；已完成步骤会被复用。',
  handleOwner: '此操作需要对应 Project 的 owner 或 manager 执行。', handleWorkbench: '当前阶段没有可在 Profile 中执行的动作，请到 Factory Workbench 继续下一步。',
  binding: '协调 Assistant 绑定待修复，暂时无法续跑。', updated: '更新于',
  decisionFailed: '提交未完成，重试会沿用相同操作标识。', completed: '已完成', pending: '已排队', running: '运行中', waiting: '等待验证', blocked: '需人工处理', failed: '失败',
  statuses: { investigating: '调查中', planning: '规划中', awaiting_approval: '待审批', approved: '已批准', executing: '执行中', verifying: '验证中', recovered: '已恢复', escalated: '已升级', rejected: '已拒绝' },
  severity: { medium: '中', high: '高', critical: '严重' },
  reasons: { coordinator_binding_missing: '协调 Assistant 绑定缺失或已变更。', project_binding_not_ready: 'Case Project 尚未就绪。', external_adapters_unconfigured: '外部系统适配器需要配置。',
    approval_permission_revoked: '原审批者已不再拥有 owner 或 manager 权限。', approval_version_changed: '已批准的方案版本发生了变化。', case_revision_changed: '审批后案件发生了变化，请审阅最新版本。',
    verification_requires_attention: '验证 Assistant 需要人工处理。', verification_evidence_incomplete: '验证未提供所需的业务完成证据。', verification_timeout: '验证超时，需要人工处理。',
    execution_requires_attention: '执行需要人工处理。', new_human_gate: '下一步需要人工决定。', infrastructure_failure: '后台服务暂不可用，已完成步骤已保留。' }
}
export const profileText = (locale?: string): Bundle => locale?.startsWith('zh') ? zh : en
export function reasonText(code: string | null, text: Bundle) { return code && code in text.reasons ? text.reasons[code as keyof Bundle['reasons']] : code }
