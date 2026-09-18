export const messages = {
  plan_review_in_chat: {
    zh: '审批统一在右侧对话中完成；此处仅展示计划内容、状态和执行结果。',
    en: 'Review and approve in the chat panel. This view shows plan details, status and execution receipts.',
  },
  plan_open_chat_review: { zh: '转到对话确认', en: 'Review in chat' },
  plan_refresh_status: { zh: '刷新状态', en: 'Refresh status' },
  collection_more: { zh: '加载更多', en: 'Load more' },
  collection_loading: { zh: '正在加载…', en: 'Loading…' },
  dashboard_more: { zh: '更多看板', en: 'More dashboards' },
  charts_more: { zh: '更多图表', en: 'More charts' },
  resize_sidebar: { zh: '拖动调整连接栏宽度', en: 'Drag to resize the connection sidebar' },
  resize_sidebar_sections: { zh: '拖动调整对象列表和导航高度', en: 'Drag to resize the object list and navigation' },
  snapshot_legend: { zh: '+ 新增　− 删除　~ 修改', en: '+ Added   − Removed   ~ Changed' },
  connection_loading: { zh: '正在连接…', en: 'Connecting…' },
  connection_failed: { zh: '连接失败', en: 'Connection failed' },
  connection_error_details: { zh: '查看错误详情', en: 'Error details' },
  connection_retry: { zh: '重新连接', en: 'Retry connection' },
  connection_unavailable: { zh: '连接成功后可浏览数据库对象', en: 'Connect to browse database objects' },
  location_placeholder: { zh: '选择数据库 / Schema', en: 'Choose database / schema' },
  dashboard_empty: { zh: '暂无保存的看板', en: 'No saved dashboards' },
  snapshot_description: { zh: '保存表和字段的结构，比较两次快照之间的变化；不记录表内数据的修改。', en: 'Capture tables and columns to compare schema changes. Row data changes are not tracked.' },
  snapshot_first: { zh: '保存第一个结构快照', en: 'Capture first snapshot' },
  snapshot_empty: { zh: '还没有结构快照。选择连接后，保存当前数据库结构。', en: 'No snapshots yet. Select a connection to capture its schema.' },
  snapshot_one: { zh: '已有一份快照。再保存一份同一数据库范围的快照后即可比较。', en: 'Capture another snapshot of the same database scope to compare.' },
  snapshot_before: { zh: '基准快照', en: 'Baseline snapshot' },
  snapshot_after: { zh: '对比快照', en: 'Comparison snapshot' },
  snapshot_scope: { zh: '请选择同一数据源、数据库和 Schema 的两份不同快照。', en: 'Choose two different snapshots of the same source, database and schema.' },

  m_a4b52cc7: {
    zh: '查询图表',
    en: 'Query chart',
  },
  m_0b310cb5: {
    zh: '先运行查询，再创建图表',
    en: 'Run a query to create a chart',
  },
  m_01f78a67: {
    zh: '柱状图',
    en: 'Bar',
  },
  m_3b6a0fef: {
    zh: '折线图',
    en: 'Line',
  },
  m_5d5ab793: {
    zh: '保存图表',
    en: 'Save chart',
  },
  m_5aa4b5b5: {
    zh: '图表使用当前结果的前 100 行；数值转换仅用于可视化。',
    en: 'Chart uses the first 100 loaded rows; numeric conversion is only for visualization.',
  },
  m_f403f7b9: {
    zh: '分组',
    en: 'Group',
  },
  m_debfceb6: {
    zh: '基于已加载结果计算',
    en: 'Computed from loaded results',
  },
  m_46fe2261: {
    zh: '只展示元数据中实际声明的外键；未声明的关系不会被推断。',
    en: 'Only declared foreign keys are shown; relationships are never inferred.',
  },
  m_8a5b6c6f: {
    zh: '查询看板',
    en: 'Query dashboard',
  },
  m_dc52906b: {
    zh: '打开看板',
    en: 'Open dashboard',
  },
  m_15563943: {
    zh: '保存看板',
    en: 'Save dashboard',
  },
  m_3366065c: {
    zh: '图表引用保存时的查询结果，显示执行依据；刷新数据请重新运行对应查询。',
    en: 'Charts use saved query results and retain execution evidence. Rerun a query to refresh its data.',
  },
  m_c0f8be17: {
    zh: '结构快照已完成',
    en: 'Schema snapshot completed',
  },
  m_90e4fe99: {
    zh: '后台任务未确认成功，请查看回执',
    en: 'Background task did not confirm success; inspect its receipt',
  },
  m_a3dcb598: {
    zh: '事务状态：',
    en: 'Transaction status: ',
  },
  m_fe4bc4d8: {
    zh: '请选择数据源',
    en: 'Choose a connection',
  },
  m_4c02b7d9: {
    zh: '请选择一条语句，或使用脚本执行',
    en: 'Select one statement or run as script',
  },
  m_790370df: {
    zh: '写脚本请逐条生成计划',
    en: 'Create separate plans for script mutations',
  },
  m_0fc02e88: {
    zh: '从 SQL 编辑器执行变更',
    en: 'Change from SQL editor',
  },
  m_982fbc1d: {
    zh: '语句无法证明为只读，已阻止自动执行',
    en: 'Statement cannot be proven read-only',
  },
  m_d5103240: {
    zh: '已完成操作，可刷新执行记录',
    en: 'completed an operation; refresh history',
  },
  m_65413585: {
    zh: '图表已保存',
    en: 'Chart saved',
  },
  m_b7aee3d1: {
    zh: '行已导出',
    en: 'rows exported',
  },
  m_755c01b0: {
    zh: '（存在更多结果）',
    en: ' (more results available)',
  },
  m_682329d2: {
    zh: '结果',
    en: 'Results',
  },
  m_3074ee5e: {
    zh: '执行计划',
    en: 'Explain',
  },
  m_ede385f4: {
    zh: '结构',
    en: 'Structure',
  },
  m_b90ca172: {
    zh: '图表',
    en: 'Chart',
  },
  m_2dc4daa4: {
    zh: '透视',
    en: 'Pivot',
  },
  m_59490576: {
    zh: '文档',
    en: 'Docs',
  },
  m_88438c0f: {
    zh: '跳到编辑器',
    en: 'Skip to editor',
  },
  m_7d804c1b: {
    zh: '数据库工作台',
    en: 'DATABASE WORKSPACE',
  },
  m_dfb9303f: {
    zh: '只读验收模式',
    en: 'Read-only test',
  },
  m_7d8505c1: {
    zh: '切换主题',
    en: 'Toggle theme',
  },
  m_25559eb2: {
    zh: '连接和对象',
    en: 'Connections and objects',
  },
  m_2ae89b8a: {
    zh: '连接',
    en: 'Connections',
  },
  m_597f3537: {
    zh: '新增数据源',
    en: 'Add data source',
  },
  m_ec96e70b: {
    zh: '选择数据源',
    en: 'Choose connection',
  },
  m_e2e07196: {
    zh: '选择数据源…',
    en: 'Choose connection…',
  },
  m_725559da: {
    zh: '数据库 / Schema',
    en: 'Database / schema',
  },
  m_9277b744: {
    zh: '搜索对象',
    en: 'Search objects',
  },
  m_3af242a9: {
    zh: '搜索表、视图…',
    en: 'Search objects…',
  },
  m_4e4481ee: {
    zh: '数据库对象',
    en: 'DATABASE OBJECTS',
  },
  m_140abb82: {
    zh: '刷新',
    en: 'Refresh',
  },
  m_7a87f6f7: {
    zh: '生成查询',
    en: 'Open SELECT',
  },
  m_86763d84: {
    zh: '没有匹配对象',
    en: 'No matching objects',
  },
  m_df80d695: {
    zh: '选择连接以浏览对象',
    en: 'Select a connection to browse objects',
  },
  m_29fe68f7: {
    zh: '查询历史',
    en: 'History',
  },
  m_7a9728cc: {
    zh: '收藏查询',
    en: 'Saved queries',
  },
  m_a364356f: {
    zh: '保存的图表',
    en: 'Saved charts',
  },
  m_6ea6d448: {
    zh: '查询看板',
    en: 'Dashboard',
  },
  m_a25928cd: {
    zh: '结构快照与对比',
    en: 'Schema snapshots',
  },
  m_2dc6e570: {
    zh: '操作计划',
    en: 'Operation plans',
  },
  m_41e7faf0: {
    zh: '连接执行策略',
    en: 'Execution policy',
  },
  m_486c22ee: {
    zh: '关闭标签',
    en: 'Close tab',
  },
  m_27fc426c: {
    zh: '请先结束此标签的事务',
    en: 'Finish this tab transaction first',
  },
  m_96c8221f: {
    zh: '新建查询',
    en: 'New query',
  },
  m_42fad981: {
    zh: '运行',
    en: 'Run',
  },
  m_e1421329: {
    zh: '脚本',
    en: 'Script',
  },
  m_53dd6327: {
    zh: '估算计划',
    en: 'Explain',
  },
  m_21498624: {
    zh: '格式化 SQL',
    en: 'Format SQL',
  },
  m_5a161016: {
    zh: '保存草稿',
    en: 'Save draft',
  },
  m_530a9995: {
    zh: '草稿已保存',
    en: 'Draft saved',
  },
  m_d94a8eaf: {
    zh: '取消',
    en: 'Cancel',
  },
  m_25339cf2: {
    zh: '行数限制',
    en: 'Row limit',
  },
  m_eb541124: {
    zh: '行',
    en: 'rows',
  },
  m_e4eed595: {
    zh: '让智能体优化当前 SQL',
    en: 'Ask Agent to optimize SQL',
  },
  m_79574ee9: {
    zh: '请只读分析当前 SQL 草稿，读取表结构并查看估算执行计划，给出有依据的优化建议。',
    en: 'Analyze the selected SQL draft with read-only schema and estimated EXPLAIN tools; provide evidence-based optimization advice.',
  },
  m_ad75e18a: {
    zh: '智能助手',
    en: 'Ask Agent',
  },
  m_7fb2fe77: {
    zh: '未连接',
    en: 'No connection',
  },
  m_3bbb2b3f: {
    zh: '事务进行中 · 最长 5 分钟',
    en: 'Transaction active · 5 min maximum',
  },
  m_a3375e2d: {
    zh: '提交',
    en: 'Commit',
  },
  m_6b0b7015: {
    zh: '回滚',
    en: 'Rollback',
  },
  m_a0a0d313: {
    zh: '需要可写连接策略及变更权限',
    en: 'Requires writable policy and change permission',
  },
  m_e0154315: {
    zh: '此引擎不开放通用事务',
    en: 'General transactions unavailable for this engine',
  },
  m_65414071: {
    zh: '调整结果面板',
    en: 'Resize results',
  },
  m_93929287: {
    zh: '操作未完成',
    en: 'Operation incomplete',
  },
  m_70e4f4d1: {
    zh: '查询已收藏',
    en: 'Query saved',
  },
  m_9df7a3d5: {
    zh: '收藏',
    en: 'Save query',
  },
  m_2149c196: {
    zh: '上一页',
    en: 'Previous',
  },
  m_bbe67f7d: {
    zh: '下一页',
    en: 'Next',
  },
  m_9062c69d: {
    zh: '从一条查询开始',
    en: 'Start with a query',
  },
  m_714b6980: {
    zh: '选择连接，浏览真实对象，或让智能体协助探索数据。',
    en: 'Choose a connection, explore its objects, or ask the Agent to investigate.',
  },
  m_144bae72: {
    zh: '新建 SQL',
    en: 'New SQL',
  },
  m_51da0288: {
    zh: '请发现当前数据源的数据库和表，介绍其结构；只执行只读操作。',
    en: 'Discover databases and tables in this connection using read-only tools.',
  },
  m_4f72585a: {
    zh: '智能探索',
    en: 'Explore with Agent',
  },
  m_965a49a7: {
    zh: '估算执行计划',
    en: 'Estimated execution plan',
  },
  m_70cbaa69: {
    zh: '执行依据',
    en: 'Execution',
  },
  m_16982e95: {
    zh: '选择 SELECT 语句后点击“估算计划”',
    en: 'Select a SELECT statement and click Explain',
  },
  m_6262d25d: {
    zh: '浏览数据',
    en: 'Browse data',
  },
  m_f0101b10: {
    zh: '导入',
    en: 'Import',
  },
  m_fc120e3c: {
    zh: '结构草稿',
    en: 'DDL draft',
  },
  m_60bc7fec: {
    zh: '编辑定义',
    en: 'Edit definition',
  },
  m_8338bf55: {
    zh: '字段',
    en: 'Column',
  },
  m_e1031f45: {
    zh: '类型',
    en: 'Type',
  },
  m_c7215ac2: {
    zh: '默认值',
    en: 'Default',
  },
  m_16b93c4e: {
    zh: '约束',
    en: 'Keys',
  },
  m_5b736095: {
    zh: '查看完整定义',
    en: 'Full definition',
  },
  m_5eea2f4a: {
    zh: '数据画像（样本）',
    en: 'Data profile (sample)',
  },
  m_8676852b: {
    zh: '生成样本画像查询',
    en: 'Create sample profile query',
  },
  m_e53b8625: {
    zh: '基于当前对象的真实结构生成应用代码及测试数据 SQL 草稿。不要执行写操作。',
    en: 'Generate application code and test data SQL drafts from the real selected object schema. Do not execute writes.',
  },
  m_6e8043b1: {
    zh: '代码与测试数据',
    en: 'Code & test data',
  },
  m_35987484: {
    zh: '从左侧对象树选择一张表或视图',
    en: 'Select a table or view from the object tree',
  },
  m_eb91cb84: {
    zh: '读取当前页真实关系',
    en: 'Load declared relationships',
  },
  m_423a17b1: {
    zh: '最多展示 50 个对象',
    en: 'Up to 50 objects',
  },
  m_4b059977: {
    zh: '导出 Markdown',
    en: 'Export Markdown',
  },
  m_c5f9ece6: {
    zh: '读取当前对象的结构，撰写数据库文档，清楚区分事实与推测。',
    en: 'Read the selected schema and write database documentation, separating facts from inference.',
  },
  m_9951d568: {
    zh: '智能撰写',
    en: 'Ask Agent',
  },
  m_fb3a1ca8: {
    zh: '先选择数据库对象',
    en: 'Select an object first',
  },
  m_93537e6d: {
    zh: '查询历史',
    en: 'Query history',
  },
  m_392b1246: {
    zh: '图表与看板',
    en: 'Charts & dashboards',
  },
  m_afa20c27: {
    zh: '结构快照已进入后台队列',
    en: 'Schema snapshot queued',
  },
  m_b62f5da1: {
    zh: '保存结构快照',
    en: 'Capture schema',
  },
  m_55279870: {
    zh: '导出收藏备份',
    en: 'Export saved queries',
  },
  m_2e6987e8: {
    zh: '选择旧快照',
    en: 'Before snapshot',
  },
  m_06f996be: {
    zh: '选择新快照',
    en: 'After snapshot',
  },
  m_f0749908: {
    zh: '比较',
    en: 'Compare',
  },
  m_3fcbd735: {
    zh: '迁移草稿',
    en: 'Migration draft',
  },
  m_ebb4bba1: {
    zh: '在编辑器打开迁移草稿',
    en: 'Open migration draft',
  },
  m_a6fcc228: {
    zh: '暂无记录',
    en: 'No saved records',
  },
  m_5f8bcec2: {
    zh: '冻结操作计划',
    en: 'Frozen operation plan',
  },
  m_96ca9adf: {
    zh: '目标',
    en: 'Target',
  },
  m_35b8f612: {
    zh: '策略版本',
    en: 'Policy revision',
  },
  m_5ef490d7: {
    zh: '有效期',
    en: 'Expires',
  },
  m_39589b77: {
    zh: '拒绝',
    en: 'Reject',
  },
  m_9f7239b9: {
    zh: '确认此计划',
    en: 'Approve this plan',
  },
  m_70e140d6: {
    zh: '执行已授权计划',
    en: 'Execute authorized plan',
  },
  m_a7b8a920: {
    zh: '正在执行…',
    en: 'Executing…',
  },
  m_7e9f0492: {
    zh: '就绪',
    en: 'Ready',
  },
  m_3ef6ab94: {
    zh: '正在连接宿主…',
    en: 'Connecting to host…',
  },
  m_25178a6c: {
    zh: '策略已更新',
    en: 'Policy updated',
  },
  m_3106be63: {
    zh: '连接执行策略',
    en: 'Connection execution policy',
  },
  m_a5973bd3: {
    zh: '默认只读。关闭只读后，未预授权的写操作仍需要逐项确认。',
    en: 'Read-only by default. Other writes require per-plan approval after read-only mode is disabled.',
  },
  m_35fda43d: {
    zh: '只读连接',
    en: 'Read-only connection',
  },
  m_ac8af3d3: {
    zh: '预授权动作',
    en: 'Preauthorized actions',
  },
  m_7e416e94: {
    zh: '按唯一键更新行',
    en: 'Update rows by unique key',
  },
  m_83e6ed0e: {
    zh: '导入数据',
    en: 'Import rows',
  },
  m_f9905f68: {
    zh: '限定对象（当前对象页）',
    en: 'Allowed objects (current object page)',
  },
  m_033b8e8d: {
    zh: '个对象已预授权；原始 SQL 始终逐项确认',
    en: 'objects allowed; raw SQL always requires individual approval',
  },
  m_c305949e: {
    zh: '清除所有预授权',
    en: 'Clear all preauthorizations',
  },
  m_039805d3: {
    zh: '仅管理员可保存；测试模式优先于所有授权。',
    en: 'Only administrators can save. Test mode overrides all authorization.',
  },
  m_fbd8cee0: {
    zh: '关闭',
    en: 'Close',
  },
  m_5c5e112a: {
    zh: '保存策略',
    en: 'Save policy',
  },
  m_ffe160d7: {
    zh: '字段筛选',
    en: 'Columns',
  },
  m_76beff3a: {
    zh: '查询完成，没有返回行',
    en: 'Query completed with no rows',
  },
  m_393ddc80: {
    zh: '生成修改计划',
    en: 'Propose change',
  },
} as const
export type MessageKey = keyof typeof messages
export const translate = (zh: boolean, key: MessageKey): string => messages[key][zh ? 'zh' : 'en']
