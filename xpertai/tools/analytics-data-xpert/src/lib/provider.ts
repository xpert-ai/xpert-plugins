import { QueryBus } from '@nestjs/cqrs'
import { z } from 'zod/v3'
import type { AnalyticsBinding, AnalyticsValue, JSONValue } from '@xpert-ai/contracts'
import { AnalyticsProvider, ResolveConnectorIntegrationQuery, type AnalyticsQueryProvider, type AnalyticsProviderContext, type AnalyticsDefinitionAuthoring, type AnalyticsAuthoringContext, type DataSourceActor } from '@xpert-ai/plugin-sdk'
import { DataXpertAnalyticsClient, type DataXpertClientContext } from './client'
import { DATA_XPERT_INTEGRATION, connectionSchema } from './integration'

const optionsSchema = z.object({ integrationId: z.string().uuid(), assistantCode: z.string().min(1), assistantXpertId: z.string().uuid(), workspaceId: z.string().uuid() }).strict()
@AnalyticsProvider('data-xpert.ontology')
export class DataXpertAnalyticsProvider implements AnalyticsQueryProvider {
  constructor(private readonly engine: DataXpertAnalyticsClient, private readonly queries: QueryBus) {}
  readonly descriptor = { id: 'data-xpert.ontology', name: 'data-xpert Ontology', sourceKinds: ['definition'] as ['definition'], operations: [{ name: 'action', contractVersion: 1, readOnly: true as const }] }
  readonly authoring: AnalyticsDefinitionAuthoring = {
    integrationProvider: DATA_XPERT_INTEGRATION,
    inspectSchema: { type: 'object', additionalProperties: true },
    definitionSchema: { type: 'object', properties: {}, additionalProperties: false },
    instructions: 'The system supplies integration and current Assistant identity. Inspect the authorized ontology, following nextRequest/inspectRequest. Register with definition {} then discover and preview the returned source. Do not ask the user for integration, workspace or Assistant IDs.',
    inspect: (input, context) => this.run(this.authoringContext(context), resolved => this.engine.discover(input, resolved)).then(result => JSON.parse(JSON.stringify(result))),
    prepare: async (input, context) => {
      z.object({}).strict().parse(input)
      const resolved = this.authoringContext(context)
      await this.run(resolved, current => this.engine.discover({}, current))
      return resolved.options
    }
  }
  private authoringContext(context: AnalyticsAuthoringContext): DataXpertClientContext {
    if (context.connection.kind !== 'integration') throw new Error('ANALYTICS_CONNECTION_INVALID')
    // The host uses the Assistant UUID as x-assistant-code for data-xpert calls.
    return { actor: context.actor, signal: context.signal, deadlineAt: context.deadlineAt, maxRows: 5,
      options: { integrationId: context.connection.integrationId, assistantCode: context.xpertId,
        assistantXpertId: context.xpertId, workspaceId: context.workspaceId } }
  }
  readonly configuration = { kind: 'definition' as const, connection: 'integration' as const, schema: {
    type: 'object', properties: { integrationId: { type: 'string', format: 'uuid', title: 'Integration ID' }, assistantCode: { type: 'string', title: 'Assistant code' }, assistantXpertId: { type: 'string', format: 'uuid', title: 'Assistant ID' }, workspaceId: { type: 'string', format: 'uuid', title: 'Workspace ID' } },
    required: ['integrationId', 'assistantCode', 'assistantXpertId', 'workspaceId'], additionalProperties: false
  } }
  async validateConfiguration(options: Record<string, JSONValue>, actor: DataSourceActor) {
    const parsed = optionsSchema.parse(options)
    await this.connection(parsed.integrationId, actor)
    return parsed
  }
  private async connection(id: string, actor: DataSourceActor) {
    const integration = await this.queries.execute(new ResolveConnectorIntegrationQuery(id, DATA_XPERT_INTEGRATION, { tenantId: actor.tenantId, organizationId: actor.organizationId }))
    if (!integration || integration.tenantId !== actor.tenantId || (integration.organizationId && integration.organizationId !== actor.organizationId)) throw new Error('DATAX_INTEGRATION_UNAVAILABLE')
    return connectionSchema.parse(integration.options)
  }
  private async run<T>(context: DataXpertClientContext, execute: (context: DataXpertClientContext) => Promise<T>) {
    const { integrationId, ...target } = optionsSchema.parse(context.options)
    const connection = await this.connection(integrationId, context.actor)
    const result = await execute({ ...context, options: { ...target, ...connection } })
    const current = await this.connection(integrationId, context.actor)
    if (JSON.stringify(current) !== JSON.stringify(connection)) throw new Error('DATAX_INTEGRATION_CHANGED')
    return result
  }
  discover(request: JSONValue, context: AnalyticsProviderContext) { return this.run(context, resolved => this.engine.discover(request, resolved)) }
  execute(binding: AnalyticsBinding, parameters: Record<string, AnalyticsValue>, context: AnalyticsProviderContext) { return this.run(context, resolved => this.engine.execute(binding, parameters, resolved)) }
}
