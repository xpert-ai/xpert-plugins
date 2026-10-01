import type { TPromptWorkflow } from '@xpert-ai/contracts'

// Preserve scenarios when loading against published contracts without this optional field.
type StudioPromptWorkflow = TPromptWorkflow & {
  scenarios: { id: string; label: string; args: string }[]
}

export const dbStudioPromptWorkflows = [
  {
    name: 'db-query',
    label: '查询数据',
    description: '根据真实数据库结构编写并执行只读查询。',
    category: 'db-studio',
    argsHint: '请说明要查询的数据、筛选条件和期望结果。',
    template: [
      '根据以下需求查询当前已授权连接中的数据。先检查当前选择的数据库、表和字段，再编写符合数据库方言的只读 SQL；不要猜测表名或字段。',
      '目标不明确时先询问。限制返回行数，说明筛选条件和统计口径，仅根据真实执行结果回答，不执行写入或结构变更。请使用用户输入的语言输出。',
      '',
      '{{args}}',
    ].join('\n'),
    scenarios: [
      { id: 'browse-schema', label: '浏览库表', args: '只读浏览当前连接的数据库和表，概述主要表的用途、字段和已声明的关联。没有当前连接时，先列出可用的已授权连接供我选择。' },
      { id: 'preview-rows', label: '查看样本', args: '查看当前选中表的字段定义和最多 20 行样本，说明主要字段含义、空值和需要注意的数据格式。没有选中表时先让我选择。' },
      { id: 'summarize-data', label: '统计分析', args: '根据我补充的指标、维度和时间范围编写只读统计查询，展示 SQL、实际结果及统计口径。需求不足时先确认，不自行假定业务口径。' },
    ],
    tags: ['db-studio', 'query'],
    visibility: 'team',
  },
  {
    name: 'db-analyze-sql',
    label: '分析 SQL',
    description: '解释 SQL、查看估算计划并提出优化建议。',
    category: 'db-studio',
    argsHint: '请提供 SQL 或使用工作台当前 SQL，并说明分析目标。',
    template: [
      '分析当前或以下提供的 SQL，结合实际数据库方言、表结构和可获得的元数据给出说明。未提供 SQL 且无法读取当前 SQL 时先询问。',
      '仅使用不会执行目标语句的估算执行计划；不要运行 EXPLAIN ANALYZE、写入 SQL 或结构变更。区分已经验证的事实和待验证建议，不编造耗时、索引或执行结果。请使用用户输入的语言输出。',
      '',
      '{{args}}',
    ].join('\n'),
    scenarios: [
      { id: 'explain-query', label: '解释 SQL', args: '解释当前 SQL 的查询目标、关联关系、筛选条件和结果粒度，指出可能影响结果正确性的重复行、NULL 和聚合问题。' },
      { id: 'estimate-plan', label: '查看执行计划', args: '获取当前 SQL 的估算执行计划，解释扫描、过滤、关联和数据分布等关键步骤；若当前引擎不支持安全的估算计划，说明限制。' },
      { id: 'optimize-query', label: '优化查询', args: '分析当前 SQL 的性能瓶颈，给出保持结果语义的 SQL 改写和验证方法。索引或表结构建议仅供审阅，不直接执行。' },
    ],
    tags: ['db-studio', 'sql'],
    visibility: 'team',
  },
  {
    name: 'db-document',
    label: '生成文档',
    description: '根据真实结构生成数据库说明和关系文档。',
    category: 'db-studio',
    argsHint: '请指定数据库或表，以及需要的文档内容。',
    template: [
      '根据当前选中的数据库对象或以下范围，读取真实元数据并生成数据库文档。目标不明确时先询问。',
      '记录字段、类型、约束和注释；关联关系区分已声明约束与推测，业务含义不明确时标注待确认，不编造。若请求保存文件，仅在保存成功后返回实际文件。请使用用户输入的语言输出。',
      '',
      '{{args}}',
    ].join('\n'),
    scenarios: [
      { id: 'data-dictionary', label: '数据字典', args: '为当前选中的表生成数据字典，包含字段名、类型、是否可空、默认值、键约束和注释，标明缺失的业务说明。' },
      { id: 'table-relations', label: '表关系说明', args: '说明选定范围内的表关系，优先采用数据库声明的外键。对根据名称或样本推测的关系明确标注“待确认”，不要当成事实。' },
      { id: 'schema-overview', label: '数据库概览', args: '生成当前数据库的结构概览，列出可访问的表、视图和主要用途，标记元数据缺失或权限受限的部分。' },
    ],
    tags: ['db-studio', 'documentation'],
    visibility: 'team',
  },
  {
    name: 'db-change',
    label: '数据库变更',
    description: '准备数据库变更或导入计划，经人工审批后执行。',
    category: 'db-studio',
    argsHint: '请说明目标对象、变更内容及影响范围。',
    template: [
      '根据以下需求准备数据库变更。先核对授权连接、目标对象、数据库方言和写入权限；信息不足时先询问，不猜测目标或变更条件。',
      '通过 db_studio_plan_change 或 db_studio_plan_import 创建冻结计划，再调用 db_studio_execute_plan 发起对话内人工审批。复用同一计划 ID，不绕过审批、只读策略或权限检查。',
      '拒绝时不执行；批准后以实际执行回执为准，排队中不等于成功，未知结果不得盲目重试。请使用用户输入的语言输出。',
      '',
      '{{args}}',
    ].join('\n'),
    scenarios: [
      { id: 'create-table', label: '新建表', args: '根据我补充的用途、表名和字段需求准备建表计划，检查类型、主键及必要约束。先展示执行内容和影响范围，再发起人工审批。' },
      { id: 'change-columns', label: '调整字段', args: '根据我补充的目标表和字段变更准备计划，核对现有结构，说明兼容性和已有数据的影响。可能丢失数据时先明确确认需求，再发起审批。' },
      { id: 'import-data', label: '导入数据', args: '根据我选择的文件和目标表准备导入计划，核对列映射、类型、行数和数据预览，说明重复数据处理方式；信息不明确时先询问，再发起人工审批。' },
    ],
    tags: ['db-studio', 'change'],
    visibility: 'team',
  },
] satisfies StudioPromptWorkflow[]
