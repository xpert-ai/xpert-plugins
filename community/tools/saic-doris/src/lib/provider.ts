import {
  XpertToolProvider,
  XpertTool,
  XpertResource,
  type XpertBusinessToolContext,
  type ResourceReadContext
} from '@xpert-ai/plugin-sdk'
import { BadRequestException } from '@nestjs/common'
import { SaicConnections } from './connections.js'
import { configSchema, connectionConfig } from './config.js'
import { inputs, descriptions, type Inputs } from './inputs.js'
import { outputs } from './outputs.js'
const requiredContext = ['tenant', 'organization', 'principal', 'execution'] as const
const read = {
  behavior: { risk: 'read', sideEffect: 'none', idempotency: 'safe' },
  requiredContext,
  defaultApprovalMode: 'allow'
} as const
const write = {
  behavior: { risk: 'write', sideEffect: 'irreversible', idempotency: 'non_idempotent' },
  requiredContext,
  defaultApprovalMode: 'allow'
} as const
@XpertToolProvider({
  provider: 'saic_doris',
  componentKey: 'saic-doris',
  name: 'SAIC Doris',
  description: '供应链配置表工具：15 个读取工具、9 个写入工具。连接绑定当前工具集或中间件。',
  author: 'XpertAI',
  tags: ['doris', 'saic', 'mcp'],
  configSchema,
  defaultMiddleware: 'saic_doris',
  middlewares: [
    {
      provider: 'saic_doris',
      meta: {
        name: 'saic_doris',
        label: { en_US: 'SAIC Doris', zh_Hans: 'SAIC Doris' },
        description: {
          en_US: 'Use 24 supply-chain configuration tools with a platform or manual Doris connection.',
          zh_Hans: '通过平台数据源或手填 Doris 连接，使用 24 个供应链配置读写工具。'
        },
        configSchema
      }
    }
  ]
})
export class SaicDorisTools {
  constructor(private readonly connections: SaicConnections) {}

  validateConfig(config: unknown): void {
    const result = connectionConfig.safeParse(config)
    if (!result.success) {
      // Keep saving and invocation on the same rules, without returning credential values.
      throw new BadRequestException(
        `invalid_connection_config: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`
      )
    }
  }

  @XpertTool({
    name: 'ping',
    description: descriptions.ping,
    inputSchema: inputs.ping,
    outputSchema: outputs.ping,
    middleware: true,
    mcp: read
  })
  ping(input: Inputs['ping'], context: XpertBusinessToolContext) {
    return this.connections.run(context, (service) => service.ping())
  }
  @XpertTool({
    name: 'get_server_time',
    description: descriptions.get_server_time,
    inputSchema: inputs.get_server_time,
    outputSchema: outputs.get_server_time,
    middleware: true,
    mcp: read
  })
  get_server_time(input: Inputs['get_server_time'], context: XpertBusinessToolContext) {
    return this.connections.run(context, (service) => service.get_server_time())
  }
  @XpertTool({
    name: 'list_config_tables',
    description: descriptions.list_config_tables,
    inputSchema: inputs.list_config_tables,
    outputSchema: outputs.list_config_tables,
    middleware: true,
    mcp: read
  })
  list_config_tables(input: Inputs['list_config_tables'], context: XpertBusinessToolContext) {
    return this.connections.run(context, (service) => service.list_config_tables())
  }
  @XpertTool({
    name: 'describe_config_table',
    description: descriptions.describe_config_table,
    inputSchema: inputs.describe_config_table,
    outputSchema: outputs.describe_config_table,
    middleware: true,
    mcp: read
  })
  describe_config_table(input: Inputs['describe_config_table'], context: XpertBusinessToolContext) {
    return this.connections.run(context, (service) => service.describe_config_table(input))
  }
  @XpertTool({
    name: 'show_buckets',
    description: descriptions.show_buckets,
    inputSchema: inputs.show_buckets,
    outputSchema: outputs.show_buckets,
    middleware: true,
    mcp: read
  })
  show_buckets(input: Inputs['show_buckets'], context: XpertBusinessToolContext) {
    return this.connections.run(context, (service) => service.show_buckets(input))
  }
  @XpertTool({
    name: 'get_tasks',
    description: descriptions.get_tasks,
    inputSchema: inputs.get_tasks,
    outputSchema: outputs.get_tasks,
    middleware: true,
    mcp: read
  })
  get_tasks(input: Inputs['get_tasks'], context: XpertBusinessToolContext) {
    return this.connections.run(context, (service) => service.get_tasks(input))
  }
  @XpertTool({
    name: 'get_tasks_changed_spec',
    description: descriptions.get_tasks_changed_spec,
    inputSchema: inputs.get_tasks_changed_spec,
    outputSchema: outputs.get_tasks_changed_spec,
    middleware: true,
    mcp: read
  })
  get_tasks_changed_spec(input: Inputs['get_tasks_changed_spec'], context: XpertBusinessToolContext) {
    return this.connections.run(context, (service) => service.get_tasks_changed_spec())
  }
  @XpertTool({
    name: 'get_tasks_needing_onboarding',
    description: descriptions.get_tasks_needing_onboarding,
    inputSchema: inputs.get_tasks_needing_onboarding,
    outputSchema: outputs.get_tasks_needing_onboarding,
    middleware: true,
    mcp: read
  })
  get_tasks_needing_onboarding(input: Inputs['get_tasks_needing_onboarding'], context: XpertBusinessToolContext) {
    return this.connections.run(context, (service) => service.get_tasks_needing_onboarding())
  }
  @XpertTool({
    name: 'get_part_dict',
    description: descriptions.get_part_dict,
    inputSchema: inputs.get_part_dict,
    outputSchema: outputs.get_part_dict,
    middleware: true,
    mcp: read
  })
  get_part_dict(input: Inputs['get_part_dict'], context: XpertBusinessToolContext) {
    return this.connections.run(context, (service) => service.get_part_dict())
  }
  @XpertTool({
    name: 'get_owners',
    description: descriptions.get_owners,
    inputSchema: inputs.get_owners,
    outputSchema: outputs.get_owners,
    middleware: true,
    mcp: read
  })
  get_owners(input: Inputs['get_owners'], context: XpertBusinessToolContext) {
    return this.connections.run(context, (service) => service.get_owners())
  }
  @XpertTool({
    name: 'get_ship_rules',
    description: descriptions.get_ship_rules,
    inputSchema: inputs.get_ship_rules,
    outputSchema: outputs.get_ship_rules,
    middleware: true,
    mcp: read
  })
  get_ship_rules(input: Inputs['get_ship_rules'], context: XpertBusinessToolContext) {
    return this.connections.run(context, (service) => service.get_ship_rules())
  }
  @XpertTool({
    name: 'check_dict_issues',
    description: descriptions.check_dict_issues,
    inputSchema: inputs.check_dict_issues,
    outputSchema: outputs.check_dict_issues,
    middleware: true,
    mcp: read
  })
  check_dict_issues(input: Inputs['check_dict_issues'], context: XpertBusinessToolContext) {
    return this.connections.run(context, (service) => service.check_dict_issues(input))
  }
  @XpertTool({
    name: 'get_run_log',
    description: descriptions.get_run_log,
    inputSchema: inputs.get_run_log,
    outputSchema: outputs.get_run_log,
    middleware: true,
    mcp: read
  })
  get_run_log(input: Inputs['get_run_log'], context: XpertBusinessToolContext) {
    return this.connections.run(context, (service) => service.get_run_log(input))
  }
  @XpertTool({
    name: 'get_agent_runs',
    description: descriptions.get_agent_runs,
    inputSchema: inputs.get_agent_runs,
    outputSchema: outputs.get_agent_runs,
    middleware: true,
    mcp: read
  })
  get_agent_runs(input: Inputs['get_agent_runs'], context: XpertBusinessToolContext) {
    return this.connections.run(context, (service) => service.get_agent_runs(input))
  }
  @XpertTool({
    name: 'query_config',
    description: descriptions.query_config,
    inputSchema: inputs.query_config,
    outputSchema: outputs.query_config,
    middleware: true,
    mcp: read
  })
  query_config(input: Inputs['query_config'], context: XpertBusinessToolContext) {
    return this.connections.run(context, (service) => service.query_config(input))
  }
  @XpertTool({
    name: 'upsert_part_refs',
    description: descriptions.upsert_part_refs,
    inputSchema: inputs.upsert_part_refs,
    outputSchema: outputs.upsert_part_refs,
    middleware: true,
    mcp: write
  })
  upsert_part_refs(input: Inputs['upsert_part_refs'], context: XpertBusinessToolContext) {
    return this.connections.run(context, (service) => service.upsert_part_refs(input))
  }
  @XpertTool({
    name: 'upsert_owners',
    description: descriptions.upsert_owners,
    inputSchema: inputs.upsert_owners,
    outputSchema: outputs.upsert_owners,
    middleware: true,
    mcp: write
  })
  upsert_owners(input: Inputs['upsert_owners'], context: XpertBusinessToolContext) {
    return this.connections.run(context, (service) => service.upsert_owners(input))
  }
  @XpertTool({
    name: 'upsert_ship_rules',
    description: descriptions.upsert_ship_rules,
    inputSchema: inputs.upsert_ship_rules,
    outputSchema: outputs.upsert_ship_rules,
    middleware: true,
    mcp: write
  })
  upsert_ship_rules(input: Inputs['upsert_ship_rules'], context: XpertBusinessToolContext) {
    return this.connections.run(context, (service) => service.upsert_ship_rules(input))
  }
  @XpertTool({
    name: 'create_task',
    description: descriptions.create_task,
    inputSchema: inputs.create_task,
    outputSchema: outputs.create_task,
    middleware: true,
    mcp: write
  })
  create_task(input: Inputs['create_task'], context: XpertBusinessToolContext) {
    return this.connections.run(context, (service) => service.create_task(input))
  }
  @XpertTool({
    name: 'update_task',
    description: descriptions.update_task,
    inputSchema: inputs.update_task,
    outputSchema: outputs.update_task,
    middleware: true,
    mcp: write
  })
  update_task(input: Inputs['update_task'], context: XpertBusinessToolContext) {
    return this.connections.run(context, (service) => service.update_task(input))
  }
  @XpertTool({
    name: 'set_task_agent_state',
    description: descriptions.set_task_agent_state,
    inputSchema: inputs.set_task_agent_state,
    outputSchema: outputs.set_task_agent_state,
    middleware: true,
    mcp: write
  })
  set_task_agent_state(input: Inputs['set_task_agent_state'], context: XpertBusinessToolContext) {
    return this.connections.run(context, (service) => service.set_task_agent_state(input))
  }
  @XpertTool({
    name: 'insert_run_log',
    description: descriptions.insert_run_log,
    inputSchema: inputs.insert_run_log,
    outputSchema: outputs.insert_run_log,
    middleware: true,
    mcp: write
  })
  insert_run_log(input: Inputs['insert_run_log'], context: XpertBusinessToolContext) {
    return this.connections.run(context, (service) => service.insert_run_log(input))
  }
  @XpertTool({
    name: 'insert_agent_run',
    description: descriptions.insert_agent_run,
    inputSchema: inputs.insert_agent_run,
    outputSchema: outputs.insert_agent_run,
    middleware: true,
    mcp: write
  })
  insert_agent_run(input: Inputs['insert_agent_run'], context: XpertBusinessToolContext) {
    return this.connections.run(context, (service) => service.insert_agent_run(input))
  }
  @XpertTool({
    name: 'update_agent_run',
    description: descriptions.update_agent_run,
    inputSchema: inputs.update_agent_run,
    outputSchema: outputs.update_agent_run,
    middleware: true,
    mcp: write
  })
  update_agent_run(input: Inputs['update_agent_run'], context: XpertBusinessToolContext) {
    return this.connections.run(context, (service) => service.update_agent_run(input))
  }
  @XpertResource({
    key: 'config_tables',
    uri: 'schema://saic/config-tables',
    title: 'SAIC configuration schema',
    description: 'Overview of the six visible configuration tables.',
    mimeType: 'application/json',
    requiredContext: [...requiredContext],
    cacheTtlMs: 0
  })
  async get_config_schema(context: ResourceReadContext) {
    const data = await this.connections.run(context, (service) => service.get_config_schema())
    return { contents: [{ uri: context.resourceUri, mimeType: 'application/json', text: JSON.stringify(data) }] }
  }
}
