import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Ajv, type ErrorObject } from 'ajv'
import type { I18nObject, JsonSchemaObjectType } from '@xpert-ai/contracts'
import { parseDiagramIr } from './diagram.schema.js'
import type {
  ArtifactTemplateAdapter,
  ArtifactTemplateCatalog,
  ArtifactTemplateDefinition,
  ArtifactTemplateDescriptor,
  ArtifactTemplateQuery,
  DiagramIR,
  DiagramJsonObject,
  DiagramTemplateBuilderId,
  DiagramTemplatePayload
} from './diagram.types.js'

const ajv = new Ajv({ allErrors: true, strict: false })

@Injectable()
export class DiagramArtifactTemplateAdapter implements ArtifactTemplateAdapter<DiagramTemplatePayload, DiagramIR> {
  readonly artifactType = 'excalidraw.diagram-ir'

  validate(definition: ArtifactTemplateDefinition<DiagramTemplatePayload>) {
    if (definition.descriptor.artifactType !== this.artifactType) throw new BadRequestException('Unsupported artifact template type.')
    if (!BUILDERS.has(definition.payload.builderId)) throw new BadRequestException(`Unknown template builder "${definition.payload.builderId}".`)
    parseDiagramIr(definition.payload.base)
    const validate = ajv.compile(definition.inputSchema)
    if (!validate(definition.defaults)) throw new BadRequestException(formatAjvErrors(validate.errors))
  }

  instantiate(definition: ArtifactTemplateDefinition<DiagramTemplatePayload>, parameters: DiagramJsonObject): DiagramIR {
    this.validate(definition)
    const validate = ajv.compile(definition.inputSchema)
    const merged = deepMerge(definition.defaults, parameters)
    if (!validate(merged)) throw new BadRequestException(formatAjvErrors(validate.errors))
    const title = readString(merged.title) ?? definition.payload.base.title
    const subtitle = readString(merged.subtitle) ?? definition.payload.base.subtitle
    const labels = readStringRecord(merged.labels)
    const colorScheme = merged.colorScheme === 'dark' ? 'dark' : definition.payload.base.appearance.colorScheme
    const rendering = merged.rendering === 'clean' || merged.rendering === 'sketch' ? merged.rendering : definition.payload.base.appearance.rendering
    const ir: DiagramIR = {
      ...structuredClone(definition.payload.base),
      title,
      ...(subtitle ? { subtitle } : {}),
      appearance: { ...definition.payload.base.appearance, colorScheme, rendering },
      nodes: definition.payload.base.nodes.map((node) => ({ ...node, label: labels[node.id] ?? node.label })),
      groups: definition.payload.base.groups.map((group) => ({ ...group, label: labels[group.id] ?? group.label })),
      edges: definition.payload.base.edges.map((edge) => ({ ...edge, label: labels[edge.id] ?? edge.label }))
    }
    return parseDiagramIr(ir)
  }

  preview(definition: ArtifactTemplateDefinition<DiagramTemplatePayload>, parameters: DiagramJsonObject) {
    return this.instantiate(definition, parameters)
  }
}

@Injectable()
export class ArtifactTemplateCatalogService implements ArtifactTemplateCatalog<DiagramTemplatePayload> {
  private readonly templates = new Map<string, ArtifactTemplateDefinition<DiagramTemplatePayload>>()

  constructor(private readonly adapter: DiagramArtifactTemplateAdapter) {
    for (const template of BUILTIN_DIAGRAM_TEMPLATES) {
      this.validate(template)
      const compositeKey = templateKey(template.descriptor.key, template.descriptor.version)
      if (this.templates.has(compositeKey)) throw new Error(`Duplicate artifact template ${compositeKey}.`)
      this.templates.set(compositeKey, template)
    }
  }

  list(query: ArtifactTemplateQuery = {}) {
    const search = query.search?.trim().toLowerCase() ?? ''
    const requiredTags = new Set(query.tags ?? [])
    return [...this.templates.values()]
      .map((template) => template.descriptor)
      .filter((descriptor) => !query.category || descriptor.category === query.category)
      .filter((descriptor) => !requiredTags.size || [...requiredTags].every((tag) => descriptor.tags.includes(tag)))
      .filter((descriptor) => !search || [descriptor.key, descriptor.category, ...descriptor.tags, descriptor.title.en_US, descriptor.title.zh_Hans]
        .filter((item): item is string => typeof item === 'string')
        .some((item) => item.toLowerCase().includes(search)))
      .sort((a, b) => a.category.localeCompare(b.category) || a.key.localeCompare(b.key))
  }

  get(key: string, version = '1.0.0') {
    const template = this.templates.get(templateKey(key, version))
    if (!template) throw new NotFoundException(`Artifact template "${key}@${version}" was not found.`)
    return template
  }

  validate(definition: ArtifactTemplateDefinition<DiagramTemplatePayload>) {
    this.adapter.validate(definition)
    const { key, version, preview } = definition.descriptor
    if (!key.trim() || !version.trim()) throw new BadRequestException('Template key and version are required.')
    if (preview && (preview.assetPath.includes('..') || preview.assetPath.startsWith('/'))) {
      throw new BadRequestException(`Template preview path is unsafe: ${preview.assetPath}`)
    }
  }

  instantiate(key: string, version: string | undefined, parameters: DiagramJsonObject) {
    const definition = this.get(key, version)
    return this.adapter.instantiate(definition, parameters)
  }
}

const COMMON_INPUT_SCHEMA: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 240 },
    subtitle: { type: 'string', maxLength: 500 },
    labels: { type: 'object', additionalProperties: { type: 'string', maxLength: 240 } },
    colorScheme: { type: 'string', enum: ['light', 'dark'] },
    rendering: { type: 'string', enum: ['clean', 'sketch'] }
  },
  required: ['title'],
  additionalProperties: false
}

function template(
  key: string,
  builderId: DiagramTemplateBuilderId,
  title: I18nObject,
  description: I18nObject,
  category: 'General' | 'AI & Agent',
  tags: string[],
  base: DiagramIR
): ArtifactTemplateDefinition<DiagramTemplatePayload> {
  return {
    descriptor: {
      schemaVersion: 1,
      key,
      version: '1.0.0',
      artifactType: 'excalidraw.diagram-ir',
      title,
      description,
      category,
      tags,
      preview: { assetPath: `assets/diagram-templates/${key}.svg`, alt: title }
    },
    inputSchema: COMMON_INPUT_SCHEMA,
    defaults: { title: base.title, labels: {}, colorScheme: base.appearance.colorScheme, rendering: base.appearance.rendering },
    examples: [
      { locale: 'en_US', prompt: `Create a ${title.en_US ?? key} diagram.`, parameters: { title: base.title } },
      { locale: 'zh_Hans', prompt: `使用${title.zh_Hans ?? key}模板创建图表。`, parameters: { title: base.title } }
    ],
    payload: { builderId, base }
  }
}

function baseIr(input: Pick<DiagramIR, 'kind' | 'title' | 'layout' | 'groups' | 'nodes' | 'edges'> & Partial<Pick<DiagramIR, 'subtitle' | 'annotations' | 'legend' | 'appearance' | 'canvas'>>): DiagramIR {
  return {
    schemaVersion: 1,
    kind: input.kind,
    title: input.title,
    ...(input.subtitle ? { subtitle: input.subtitle } : {}),
    canvas: input.canvas ?? { width: 1200, height: 760, padding: 48 },
    appearance: input.appearance ?? { colorScheme: 'light', rendering: 'clean', palette: 'semantic' },
    layout: input.layout,
    groups: input.groups,
    nodes: input.nodes,
    edges: input.edges,
    annotations: input.annotations ?? [],
    legend: input.legend ?? []
  }
}

const layeredLayout = { strategy: 'layered', direction: 'top-to-bottom', horizontalGap: 80, verticalGap: 110, seed: 'builtin-v1' } as const
const flowLayout = { strategy: 'flow', direction: 'left-to-right', horizontalGap: 90, verticalGap: 90, seed: 'builtin-v1' } as const

export const BUILTIN_DIAGRAM_TEMPLATES: ArtifactTemplateDefinition<DiagramTemplatePayload>[] = [
  template('layered-architecture', 'layered-v1', { en_US: 'Layered Architecture', zh_Hans: '分层架构' }, { en_US: 'A reusable client, service, and data-layer architecture.', zh_Hans: '可复用的客户端、服务与数据分层架构。' }, 'General', ['architecture', 'layered'], baseIr({
    kind: 'architecture', title: 'Layered System Architecture', layout: layeredLayout,
    groups: [{ id: 'interface', label: 'Interface', kind: 'lane', order: 1 }, { id: 'services', label: 'Services', kind: 'lane', order: 2 }, { id: 'data', label: 'Data', kind: 'lane', order: 3 }],
    nodes: [
      { id: 'client', kind: 'user', label: 'Client', groupId: 'interface', layer: 0 },
      { id: 'gateway', kind: 'api', label: 'API Gateway', groupId: 'services', layer: 1 },
      { id: 'service', kind: 'service', label: 'Application Service', groupId: 'services', layer: 2 },
      { id: 'store', kind: 'database', label: 'Data Store', groupId: 'data', layer: 3 }
    ],
    edges: [
      { id: 'client-gateway', source: { nodeId: 'client' }, target: { nodeId: 'gateway' }, flow: 'primary', label: 'request' },
      { id: 'gateway-service', source: { nodeId: 'gateway' }, target: { nodeId: 'service' }, flow: 'control' },
      { id: 'service-store', source: { nodeId: 'service' }, target: { nodeId: 'store' }, flow: 'write', label: 'data' }
    ]
  })),
  template('process-flow', 'flow-v1', { en_US: 'Process Flow', zh_Hans: '流程图' }, { en_US: 'A decision-oriented process flow.', zh_Hans: '带决策节点的通用流程。' }, 'General', ['flowchart', 'process'], baseIr({
    kind: 'flowchart', title: 'Process Flow', layout: flowLayout, groups: [],
    nodes: [
      { id: 'start', kind: 'process', label: 'Start', layer: 0 },
      { id: 'prepare', kind: 'process', label: 'Prepare', layer: 1 },
      { id: 'decision', kind: 'decision', label: 'Ready?', layer: 2 },
      { id: 'finish', kind: 'process', label: 'Finish', layer: 3 }
    ],
    edges: [
      { id: 'start-prepare', source: { nodeId: 'start' }, target: { nodeId: 'prepare' }, flow: 'primary' },
      { id: 'prepare-decision', source: { nodeId: 'prepare' }, target: { nodeId: 'decision' }, flow: 'control' },
      { id: 'decision-finish', source: { nodeId: 'decision' }, target: { nodeId: 'finish' }, flow: 'primary', label: 'yes' }
    ]
  })),
  template('sequence-interaction', 'sequence-v1', { en_US: 'Sequence Interaction', zh_Hans: '时序交互' }, { en_US: 'Participants and ordered request/response messages.', zh_Hans: '参与者与有序请求响应消息。' }, 'General', ['sequence', 'interaction'], baseIr({
    kind: 'sequence', title: 'Sequence Interaction', layout: { ...flowLayout, strategy: 'sequence' }, groups: [],
    nodes: [{ id: 'user', kind: 'actor', label: 'User', order: 1 }, { id: 'app', kind: 'service', label: 'Application', order: 2 }, { id: 'api', kind: 'api', label: 'API', order: 3 }, { id: 'db', kind: 'database', label: 'Database', order: 4 }],
    edges: [
      { id: 'submit', source: { nodeId: 'user' }, target: { nodeId: 'app' }, flow: 'primary', label: 'submit', order: 1 },
      { id: 'request', source: { nodeId: 'app' }, target: { nodeId: 'api' }, flow: 'control', label: 'request', order: 2 },
      { id: 'query', source: { nodeId: 'api' }, target: { nodeId: 'db' }, flow: 'read', label: 'query', order: 3 }
    ]
  })),
  template('radial-concept-map', 'radial-v1', { en_US: 'Radial Concept Map', zh_Hans: '径向概念图' }, { en_US: 'A central topic with evenly distributed concepts.', zh_Hans: '中心主题与均匀分布的概念分支。' }, 'General', ['mind-map', 'radial'], baseIr({
    kind: 'mind-map', title: 'Concept Map', layout: { strategy: 'radial', direction: 'top-to-bottom', horizontalGap: 80, verticalGap: 80, seed: 'builtin-v1' }, groups: [],
    nodes: [{ id: 'core', kind: 'agent', label: 'Core Concept', layer: 0 }, { id: 'one', kind: 'process', label: 'Concept One' }, { id: 'two', kind: 'process', label: 'Concept Two' }, { id: 'three', kind: 'process', label: 'Concept Three' }, { id: 'four', kind: 'process', label: 'Concept Four' }],
    edges: ['one', 'two', 'three', 'four'].map((id) => ({ id: `core-${id}`, source: { nodeId: 'core' }, target: { nodeId: id }, flow: 'primary' as const }))
  })),
  template('comparison-matrix', 'matrix-v1', { en_US: 'Comparison Matrix', zh_Hans: '对比矩阵' }, { en_US: 'A structured option comparison.', zh_Hans: '结构化方案对比矩阵。' }, 'General', ['comparison', 'matrix'], baseIr({
    kind: 'comparison', title: 'Approach Comparison', layout: { strategy: 'matrix', direction: 'left-to-right', horizontalGap: 48, verticalGap: 48, seed: 'builtin-v1' }, groups: [],
    nodes: [{ id: 'option-a', kind: 'note', label: 'Option A' }, { id: 'option-b', kind: 'note', label: 'Option B' }, { id: 'option-c', kind: 'note', label: 'Option C' }, { id: 'criteria', kind: 'note', label: 'Decision Criteria' }], edges: []
  })),
  template('rag-pipeline', 'layered-v1', { en_US: 'RAG Pipeline', zh_Hans: 'RAG 流水线' }, { en_US: 'Retrieval, augmentation, and generation flow.', zh_Hans: '检索、增强和生成流程。' }, 'AI & Agent', ['rag', 'ai', 'data-flow'], baseIr({
    kind: 'data-flow', title: 'RAG Pipeline', layout: flowLayout, groups: [],
    nodes: [{ id: 'query', kind: 'user', label: 'User Query', layer: 0 }, { id: 'embed', kind: 'model', label: 'Embedding Model', layer: 1 }, { id: 'vector', kind: 'vector-store', label: 'Vector Store', layer: 2 }, { id: 'context', kind: 'document', label: 'Retrieved Context', layer: 3 }, { id: 'llm', kind: 'model', label: 'LLM', layer: 4 }, { id: 'answer', kind: 'process', label: 'Grounded Answer', layer: 5 }],
    edges: [
      { id: 'query-embed', source: { nodeId: 'query' }, target: { nodeId: 'embed' }, flow: 'transform' },
      { id: 'embed-vector', source: { nodeId: 'embed' }, target: { nodeId: 'vector' }, flow: 'read', label: 'embedding' },
      { id: 'vector-context', source: { nodeId: 'vector' }, target: { nodeId: 'context' }, flow: 'read', label: 'chunks' },
      { id: 'context-llm', source: { nodeId: 'context' }, target: { nodeId: 'llm' }, flow: 'primary' },
      { id: 'llm-answer', source: { nodeId: 'llm' }, target: { nodeId: 'answer' }, flow: 'primary' }
    ]
  })),
  template('agent-tool-loop', 'flow-v1', { en_US: 'Agent Tool Loop', zh_Hans: 'Agent 工具循环' }, { en_US: 'Reasoning, tool selection, execution, and feedback.', zh_Hans: '推理、工具选择、执行与反馈循环。' }, 'AI & Agent', ['agent', 'tool-call', 'loop'], baseIr({
    kind: 'agent', title: 'Agent Tool Loop', layout: flowLayout, groups: [],
    nodes: [{ id: 'input', kind: 'user', label: 'User Input', layer: 0 }, { id: 'agent', kind: 'agent', label: 'Agent', layer: 1 }, { id: 'selector', kind: 'decision', label: 'Select Tool', layer: 2 }, { id: 'tool', kind: 'tool', label: 'Tool Runtime', layer: 3 }, { id: 'result', kind: 'process', label: 'Result Parser', layer: 4 }],
    edges: [
      { id: 'input-agent', source: { nodeId: 'input' }, target: { nodeId: 'agent' }, flow: 'primary' },
      { id: 'agent-selector', source: { nodeId: 'agent' }, target: { nodeId: 'selector' }, flow: 'control' },
      { id: 'selector-tool', source: { nodeId: 'selector' }, target: { nodeId: 'tool' }, flow: 'control' },
      { id: 'tool-result', source: { nodeId: 'tool' }, target: { nodeId: 'result' }, flow: 'primary' },
      { id: 'result-agent', source: { nodeId: 'result' }, target: { nodeId: 'agent' }, flow: 'feedback', label: 'observe', routing: { corridorY: [650] } }
    ]
  })),
  template('multi-agent-collaboration', 'layered-v1', { en_US: 'Multi-Agent Collaboration', zh_Hans: '多 Agent 协作' }, { en_US: 'Coordinator, specialist agents, shared memory, and synthesis.', zh_Hans: '协调器、专业 Agent、共享记忆与汇总。' }, 'AI & Agent', ['agent', 'multi-agent'], baseIr({
    kind: 'agent', title: 'Multi-Agent Collaboration', layout: layeredLayout, groups: [{ id: 'specialists', label: 'Specialist Agents', kind: 'cluster' }],
    nodes: [{ id: 'brief', kind: 'user', label: 'User Brief', layer: 0 }, { id: 'coordinator', kind: 'agent', label: 'Coordinator', layer: 1 }, { id: 'research', kind: 'agent', label: 'Research Agent', groupId: 'specialists', layer: 2, order: 1 }, { id: 'coding', kind: 'agent', label: 'Coding Agent', groupId: 'specialists', layer: 2, order: 2 }, { id: 'review', kind: 'agent', label: 'Review Agent', groupId: 'specialists', layer: 2, order: 3 }, { id: 'memory', kind: 'memory', label: 'Shared Memory', layer: 3 }, { id: 'synthesis', kind: 'process', label: 'Synthesis', layer: 4 }],
    edges: [
      { id: 'brief-coordinator', source: { nodeId: 'brief' }, target: { nodeId: 'coordinator' }, flow: 'primary' },
      ...['research', 'coding', 'review'].map((id) => ({ id: `coordinator-${id}`, source: { nodeId: 'coordinator' }, target: { nodeId: id }, flow: 'control' as const })),
      ...['research', 'coding', 'review'].map((id) => ({ id: `${id}-memory`, source: { nodeId: id }, target: { nodeId: 'memory' }, flow: 'write' as const })),
      { id: 'memory-synthesis', source: { nodeId: 'memory' }, target: { nodeId: 'synthesis' }, flow: 'read' }
    ]
  })),
  template('memory-architecture', 'layered-v1', { en_US: 'Memory Architecture', zh_Hans: '记忆架构' }, { en_US: 'Memory manager, storage tiers, retrieval, and response.', zh_Hans: '记忆管理器、存储层、检索与响应。' }, 'AI & Agent', ['memory', 'agent'], baseIr({
    kind: 'memory', title: 'Agent Memory Architecture', layout: layeredLayout, groups: [{ id: 'stores', label: 'Memory Stores', kind: 'cluster' }],
    nodes: [{ id: 'input', kind: 'user', label: 'Interaction', layer: 0 }, { id: 'manager', kind: 'memory', label: 'Memory Manager', layer: 1 }, { id: 'working', kind: 'memory', label: 'Working Memory', groupId: 'stores', layer: 2, order: 1 }, { id: 'vector', kind: 'vector-store', label: 'Vector Memory', groupId: 'stores', layer: 2, order: 2 }, { id: 'graph', kind: 'graph-store', label: 'Graph Memory', groupId: 'stores', layer: 2, order: 3 }, { id: 'context', kind: 'process', label: 'Context Builder', layer: 3 }, { id: 'response', kind: 'model', label: 'Personalized Response', layer: 4 }],
    edges: [
      { id: 'input-manager', source: { nodeId: 'input' }, target: { nodeId: 'manager' }, flow: 'primary' },
      ...['working', 'vector', 'graph'].map((id) => ({ id: `manager-${id}`, source: { nodeId: 'manager' }, target: { nodeId: id }, flow: 'write' as const })),
      ...['working', 'vector', 'graph'].map((id) => ({ id: `${id}-context`, source: { nodeId: id }, target: { nodeId: 'context' }, flow: 'read' as const })),
      { id: 'context-response', source: { nodeId: 'context' }, target: { nodeId: 'response' }, flow: 'primary' }
    ]
  })),
  template('microservices-platform', 'layered-v1', { en_US: 'Microservices Platform', zh_Hans: '微服务平台' }, { en_US: 'Edge, services, event infrastructure, data, and observability.', zh_Hans: '边缘、服务、事件基础设施、数据与可观测性。' }, 'AI & Agent', ['microservices', 'architecture'], baseIr({
    kind: 'architecture', title: 'Microservices Platform', layout: layeredLayout,
    groups: [{ id: 'services', label: 'Application Services', kind: 'cluster' }, { id: 'data', label: 'Data & Events', kind: 'cluster' }],
    nodes: [{ id: 'clients', kind: 'user', label: 'Client Apps', layer: 0 }, { id: 'gateway', kind: 'api', label: 'API Gateway', layer: 1 }, { id: 'auth', kind: 'service', label: 'Auth Service', groupId: 'services', layer: 2, order: 1 }, { id: 'orders', kind: 'service', label: 'Order Service', groupId: 'services', layer: 2, order: 2 }, { id: 'payments', kind: 'service', label: 'Payment Service', groupId: 'services', layer: 2, order: 3 }, { id: 'events', kind: 'queue', label: 'Event Bus', groupId: 'data', layer: 3, order: 1 }, { id: 'db', kind: 'database', label: 'PostgreSQL', groupId: 'data', layer: 3, order: 2 }, { id: 'observability', kind: 'external', label: 'Metrics & Traces', layer: 4 }],
    edges: [
      { id: 'clients-gateway', source: { nodeId: 'clients' }, target: { nodeId: 'gateway' }, flow: 'primary' },
      ...['auth', 'orders', 'payments'].map((id) => ({ id: `gateway-${id}`, source: { nodeId: 'gateway' }, target: { nodeId: id }, flow: 'control' as const })),
      { id: 'orders-events', source: { nodeId: 'orders' }, target: { nodeId: 'events' }, flow: 'async' },
      { id: 'payments-db', source: { nodeId: 'payments' }, target: { nodeId: 'db' }, flow: 'write' },
      { id: 'events-observability', source: { nodeId: 'events' }, target: { nodeId: 'observability' }, flow: 'async' }
    ]
  }))
]

const BUILDERS = new Set<DiagramTemplateBuilderId>(['layered-v1', 'flow-v1', 'sequence-v1', 'radial-v1', 'matrix-v1'])

function templateKey(key: string, version: string) {
  return `${key}@${version}`
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined) {
  return errors?.map((error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`).join('; ') ?? 'Template parameters are invalid.'
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

function deepMerge(base: DiagramJsonObject, overrides: DiagramJsonObject): DiagramJsonObject {
  const result: DiagramJsonObject = structuredClone(base)
  for (const [key, value] of Object.entries(overrides)) {
    const current = result[key]
    result[key] = current && value && typeof current === 'object' && typeof value === 'object' && !Array.isArray(current) && !Array.isArray(value)
      ? deepMerge(current as DiagramJsonObject, value as DiagramJsonObject)
      : structuredClone(value)
  }
  return result
}
