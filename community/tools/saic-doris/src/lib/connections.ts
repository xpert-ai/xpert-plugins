import { Controller, Get, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import {
  RequestContext,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry,
  type ToolExecutionContext,
  type XpertBusinessToolContext
} from '@xpert-ai/plugin-sdk'
import {
  DataSourceRuntimeCapability,
  type DataSourceActor,
  type DatabaseWorkbenchAdapter
} from '@xpert-ai/plugin-sdk/data-workbench'
import { createDorisConnection, type DorisAdapterOptions } from '@xpert-ai/plugin-mysql/doris'
import { CONFIG_KEYS, connectionConfig } from './config.js'
import { SaicDatabase } from './database.js'
import { SaicService } from './service.js'
type ConnectionContext = Pick<
  ToolExecutionContext | XpertBusinessToolContext,
  'tenantId' | 'organizationId' | 'principal' | 'host' | 'signal'
>
export type InvocationContext =
  | ConnectionContext
  | (ConnectionContext & Pick<XpertBusinessToolContext, 'surface' | 'middlewareOptions'>)
export type DorisFactory = (options: DorisAdapterOptions) => DatabaseWorkbenchAdapter
export const DORIS_FACTORY = Symbol('SAIC_DORIS_FACTORY')
@Injectable()
export class SaicConnections {
  constructor(
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry,
    @Inject(DORIS_FACTORY) private readonly manualFactory: DorisFactory
  ) {}
  async list(actor: DataSourceActor) {
    if (!actor.tenantId || !actor.organizationId || !actor.userId)
      throw new UnauthorizedException('platform_scope_required')
    return (await this.runtime.require(DataSourceRuntimeCapability).list(actor)).filter(
      (source) => source.engine === 'doris'
    )
  }
  async run<T>(context: InvocationContext, operation: (service: SaicService) => Promise<T>): Promise<T> {
    if (!context.tenantId || !context.organizationId || !context.principal?.id)
      throw new Error('platform_scope_required')
    const middleware = 'surface' in context && context.surface === 'middleware'
    let values: unknown
    if (middleware) {
      values = context.middlewareOptions
    } else {
      const credentials = context.host.credentials
      if (!credentials) throw new Error('toolset_connection_config_required')
      const entries = await Promise.all(CONFIG_KEYS.map(async (key) => [key, await credentials.get(key)] as const))
      values = Object.fromEntries(entries.filter(([, value]) => value != null))
    }
    const parsed = connectionConfig.safeParse(values)
    // Do not echo a validation error containing credential values.
    if (!parsed.success)
      throw new Error(
        `invalid_${middleware ? 'middleware' : 'toolset'}_connection_config: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`
      )
    const config = parsed.data
    if (context.signal?.aborted) throw new Error('execution_cancelled')
    let adapter: DatabaseWorkbenchAdapter
    if (config.mode === 'platform') {
      const actor = {
        tenantId: context.tenantId,
        organizationId: context.organizationId,
        userId: context.principal.userId ?? (context.principal.type === 'user' ? context.principal.id : '')
      }
      if (!(await this.list(actor)).some((source) => source.id === config.dataSourceId))
        throw new Error('doris_data_source_unavailable_or_denied')
      adapter = await this.runtime
        .require(DataSourceRuntimeCapability)
        .open({ actor, dataSourceId: config.dataSourceId })
    } else {
      adapter = this.manualFactory({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        catalog: config.database,
        apiHost: config.feHost || config.host,
        apiPort: config.fePort,
        streamLoadHosts: config.streamLoadHosts,
        use_ssl: config.useSsl,
        ssl_cacert: config.sslCa
      })
    }
    try {
      if (adapter.engine !== 'doris') throw new Error('doris_engine_required')
      return await operation(
        new SaicService(new SaicDatabase(adapter, context.signal), {
          enabled: config.streamLoadEnabled,
          minRows: config.streamLoadMinRows,
          chunkSize: config.streamLoadChunkSize
        })
      )
    } finally {
      await adapter.close()
    }
  }
}
@Controller('saic-doris')
export class SaicDataSourcesController {
  constructor(private readonly connections: SaicConnections) {}
  @Get('datasources')
  async list() {
    const sources = await this.connections.list({
      tenantId: RequestContext.currentTenantId(),
      organizationId: RequestContext.getOrganizationId() ?? '',
      userId: RequestContext.currentUserId()
    })
    return sources.map((source) => ({ value: source.id, label: source.name }))
  }
}
export const dorisFactoryProvider = { provide: DORIS_FACTORY, useValue: createDorisConnection }
