export type SupportedLocale = 'zh_Hans' | 'en_US'

const FIELD_LABELS: Record<SupportedLocale, Record<string, string>> = {
  zh_Hans: {
    size: '尺寸',
    nominal_size: '公称尺寸',
    valve_type: '阀门类型',
    is_fire_safe: '是否防火安全',
    fire_safe_certified: '防火安全认证',
    pressure_rating: '压力等级',
    design_pressure: '设计压力',
    design_temperature: '设计温度',
    face_to_face_length: '结构长度',
    flow_coefficient: '流量系数',
    flow_coefficient_cv: '流量系数（Cv）',
    backend: '数据后端',
    relation_count: '关系数量',
    related_entity_count: '相关实体数量',
    unresolved_related_entity_count: '未解析相关实体数量',
    matched_by: '匹配方式',
    source: '来源',
    snapshot_id: '快照 ID',
    graph_version: '图谱版本',
    problem: '问题描述',
    priority: '优先级',
    due_date: '期望完成日期',
    duedate: '期望完成日期',
    assignee: '负责人',
    inspection_date: '巡检日期',
    inspection_scope: '巡检范围',
    maintenance_work_order_id: '维护工单编号',
    work_order_id: '工单编号'
  },
  en_US: {
    size: 'Size',
    nominal_size: 'Nominal size',
    valve_type: 'Valve type',
    is_fire_safe: 'Fire safe',
    fire_safe_certified: 'Fire-safe certified',
    pressure_rating: 'Pressure rating',
    design_pressure: 'Design pressure',
    design_temperature: 'Design temperature',
    face_to_face_length: 'Face-to-face length',
    flow_coefficient: 'Flow coefficient',
    flow_coefficient_cv: 'Flow coefficient (Cv)',
    backend: 'Data backend',
    relation_count: 'Relation count',
    related_entity_count: 'Related entity count',
    unresolved_related_entity_count: 'Unresolved related entity count',
    matched_by: 'Matched by',
    source: 'Source',
    snapshot_id: 'Snapshot ID',
    graph_version: 'Graph version',
    problem: 'Problem',
    priority: 'Priority',
    due_date: 'Due date',
    duedate: 'Due date',
    assignee: 'Assignee',
    inspection_date: 'Inspection date',
    inspection_scope: 'Inspection scope',
    maintenance_work_order_id: 'Maintenance work order ID',
    work_order_id: 'Work order ID'
  }
}

export const TEXT = {
  zh_Hans: {
    title: '阀门业务工作台', resource: '本体资源', entityType: '实体类型', search: '搜索对象名称或编号', searchAction: '搜索',
    refresh: '刷新', snapshot: '快照', objects: '对象', overview: '概览', relations: '关系', evidence: '证据',
    constraints: '风险约束', proposals: '动作草案', audit: '审计', analyze: '让助手分析', noObjects: '没有匹配对象',
    selectObject: '选择一个对象查看 360 详情', loading: '正在加载…', attributes: '属性', relatedObjects: '相关对象',
    availableActions: '可用动作定义', pending_review: '待审核', approved: '已批准', rejected: '已拒绝', completed: '已完成',
    failed: '失败', approve: '批准', reject: '拒绝', complete: '标记完成', fail: '标记失败', noData: '暂无数据',
    confirm: '确认状态变更', confirmDescription: '此操作将写入审核状态并追加审计事件。', optionalNote: '审核说明（可选）',
    cancel: '取消', continue: '确认变更', loadFailed: '加载失败', source: '来源', collapsePanel: '收起对象面板',
    expandPanel: '展开对象面板', relationCount: '条关系', objectNavigator: '对象导航', resourcePicker: '选择本体资源',
    entityTypePicker: '选择实体类型', searchLabel: '搜索阀门对象', studio: '工程对象 Studio', actions: '动作中心',
    demoMode: '客户演示模式', ontologySource: '本体定义', demoSource: 'Demo 补充', targetSystem: '目标适配器',
    preconditions: '前置条件', expectedEffects: '预期影响', createDemoProposal: '创建 Demo 草案', unavailable: '当前不可执行',
    executeDemo: '执行 Demo', executeConfirm: '确认执行 Demo 适配器',
    executeDescription: '此操作会根据已批准草案生成模拟业务回执并追加完整审计事件，不会写入真实 ERP、EAM、QMS、DCS 或 SIS。',
    noExternalWrite: '不会写入真实外部系统', demoOutcome: '演示结果', successPath: '成功路径', failurePath: '失败路径',
    actionInput: '动作输入', outcome: '执行回执', blockingReasons: '阻断原因', adapterReady: '适配器就绪',
    ontology_action: '本体动作', engineering_review: '工程评审', ontologyInitialization: '阀门本体初始化',
    initializeOntology: '初始化本体', updateOntology: '更新本体', ontologyReady: '本体已就绪',
    ontologyVersion: '本体版本', ontologyContents: '将导入 Schema、Actions、演示对象及对象关系，并在校验通过后发布快照。',
    initializeConfirm: '确认初始化阀门本体', updateConfirm: '确认更新阀门本体',
    initializeDescription: '此操作会在当前组织的 data-xpert 中创建并发布插件内置阀门本体。',
    overwriteDescription: '此操作会覆盖当前未发布草稿，再校验并发布新的插件语义版本；已发布历史版本不会被删除。',
    initializeNow: '导入并发布', ontologyInitialized: '阀门本体已初始化并发布',
    ontologyUnavailable: '尚无可用阀门本体。请先确认 data-xpert 连接，再初始化插件内置模型。',
    ontologyState: { unconfigured: '未配置', missing: '未初始化', draft: '存在草稿', outdated: '可更新', publishing: '发布中', failed: '发布失败', current: '已就绪' }
  },
  en_US: {
    title: 'Valve Business Workbench', resource: 'Ontology resource', entityType: 'Entity type', search: 'Search name or key', searchAction: 'Search',
    refresh: 'Refresh', snapshot: 'Snapshot', objects: 'Objects', overview: 'Overview', relations: 'Relations', evidence: 'Evidence',
    constraints: 'Risk constraints', proposals: 'Proposals', audit: 'Audit', analyze: 'Ask Assistant to analyze', noObjects: 'No matching objects',
    selectObject: 'Select an object to inspect its 360 view', loading: 'Loading…', attributes: 'Attributes', relatedObjects: 'Related objects',
    availableActions: 'Available action definitions', pending_review: 'Pending review', approved: 'Approved', rejected: 'Rejected', completed: 'Completed',
    failed: 'Failed', approve: 'Approve', reject: 'Reject', complete: 'Mark completed', fail: 'Mark failed', noData: 'No data',
    confirm: 'Confirm status change', confirmDescription: 'This operation changes review status and appends an audit event.',
    optionalNote: 'Review note (optional)', cancel: 'Cancel', continue: 'Confirm change', loadFailed: 'Load failed', source: 'Source',
    collapsePanel: 'Collapse object panel', expandPanel: 'Expand object panel', relationCount: 'relations', objectNavigator: 'Object navigator',
    resourcePicker: 'Select ontology resource', entityTypePicker: 'Select entity type', searchLabel: 'Search valve objects', studio: 'Engineering object Studio',
    actions: 'Action center', demoMode: 'Customer demo mode', ontologySource: 'Ontology defined', demoSource: 'Demo fallback',
    targetSystem: 'Target adapter', preconditions: 'Preconditions', expectedEffects: 'Expected effects', createDemoProposal: 'Create Demo proposal',
    unavailable: 'Currently unavailable', executeDemo: 'Execute Demo', executeConfirm: 'Confirm Demo adapter execution',
    executeDescription: 'This records a simulated business receipt and full audit trail for the approved proposal. It never writes to a real ERP, EAM, QMS, DCS, or SIS.',
    noExternalWrite: 'No real external write', demoOutcome: 'Demo result', successPath: 'Success path', failurePath: 'Failure path',
    actionInput: 'Action input', outcome: 'Execution receipt', blockingReasons: 'Blocking reasons', adapterReady: 'Adapter ready',
    ontology_action: 'Ontology action', engineering_review: 'Engineering review', ontologyInitialization: 'Valve ontology initialization',
    initializeOntology: 'Initialize ontology', updateOntology: 'Update ontology', ontologyReady: 'Ontology ready',
    ontologyVersion: 'Ontology version', ontologyContents: 'Imports Schema, Actions, demo objects, and relationships, then publishes a validated snapshot.',
    initializeConfirm: 'Initialize valve ontology?', updateConfirm: 'Update valve ontology?',
    initializeDescription: 'This creates and publishes the plugin-owned valve ontology in data-xpert for the current organization.',
    overwriteDescription: 'This overwrites the current unpublished draft, validates it, and publishes the new plugin semantic version. Published history is retained.',
    initializeNow: 'Import and publish', ontologyInitialized: 'Valve ontology initialized and published',
    ontologyUnavailable: 'No ready valve ontology is available. Verify the data-xpert connection, then initialize the plugin-owned model.',
    ontologyState: { unconfigured: 'Not configured', missing: 'Not initialized', draft: 'Draft exists', outdated: 'Update available', publishing: 'Publishing', failed: 'Publish failed', current: 'Ready' }
  }
} as const

export function resolveLocale(locale?: string): SupportedLocale {
  return locale?.toLowerCase().startsWith('en') ? 'en_US' : 'zh_Hans'
}

export function fieldLabel(locale: SupportedLocale, key: string, fallback?: string) {
  return FIELD_LABELS[locale][normalizeFieldKey(key)] ?? fallback ?? humanizeFieldKey(key)
}

function normalizeFieldKey(key: string) {
  return key
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s.-]+/g, '_')
    .toLowerCase()
}

function humanizeFieldKey(key: string) {
  const words = normalizeFieldKey(key).split('_').filter(Boolean)
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') || key
}
