import { Inject, Injectable } from '@nestjs/common'
import { z } from 'zod/v3'
import type { AnalyticsBinding, AnalyticsProviderDescriptor, AnalyticsValue, JSONValue } from '@xpert-ai/contracts'
import { AnalyticsProvider, AnalyticsRuntimeCapability, WorkspaceFilesRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  analyticsOptionsSchema, type AnalyticsDefinitionAuthoring, type AnalyticsProviderContext, type AnalyticsQueryProvider,
  type DataSourceActor, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { definitionSchema, emptyDiscoverySchema, PROVIDER, PUBLISHED_PROVIDER } from './schema'
import { ScriptDefinitions, digest } from './definitions'
import { executeScript } from './execution'

const snapshot = z.object({ content: z.string().max(150000), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
export const publishedScriptSchema = definitionSchema.omit({ authorization: true, script: true, files: true }).extend({
  schema: z.literal('xpert.published-analytics-script/v1'), mode: z.literal('pinned'), code: snapshot,
  files: z.array(snapshot.extend({ alias: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/) })).max(8)
}).strict().superRefine((value, ctx) => {
  if (Buffer.byteLength(value.code.content) > 64000 || !value.code.content.length ||
      value.scriptSha256 !== value.code.sha256 || [value.code, ...value.files].some(file => digest(file.content) !== file.sha256) ||
      Buffer.byteLength(JSON.stringify(value)) > 180000 || new Set(value.files.map(file => file.alias)).size !== value.files.length ||
      value.sources.length > 4 || value.sources.some(source => [PROVIDER, PUBLISHED_PROVIDER].includes(source.binding.providerId)))
    ctx.addIssue({ code: 'custom', message: 'WORKSPACE_SCRIPT_PUBLICATION_INVALID' })
})
const prepareSchema = z.object({ artifactId: z.string().uuid(), versionId: z.string().uuid(),
  includeCodeAndFiles: z.literal(true) }).strict()
const prepareJsonSchema = { type: 'object', properties: { artifactId: { type: 'string', format: 'uuid' },
  versionId: { type: 'string', format: 'uuid' }, includeCodeAndFiles: { type: 'boolean', const: true } },
  required: ['artifactId', 'versionId', 'includeCodeAndFiles'], additionalProperties: false }

/** Organization visibility is granted by the platform owner action, never by a private Workspace reference. */
@Injectable()
@AnalyticsProvider(PUBLISHED_PROVIDER)
export class PublishedWorkspaceScriptProvider implements AnalyticsQueryProvider {
  readonly descriptor: AnalyticsProviderDescriptor = { id: PUBLISHED_PROVIDER, name: 'Published Python / JavaScript dataset',
    sourceKinds: ['definition'], sharing: { mode: 'viewer_permissions' }, operations: [{ name: 'query', contractVersion: 1, readOnly: true }] }
  readonly configuration = { kind: 'definition' as const, connection: 'workspace-files' as const,
    schema: { type: 'object', description: 'Immutable code and declared file snapshots. Prepare with workspace_dataset_prepare_publication; visibility is managed by the owner in Analytics settings.' } }
  readonly authoring: AnalyticsDefinitionAuthoring
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry, private readonly definitions: ScriptDefinitions) {
    this.authoring = {
      inspectSchema: { type: 'object', properties: {}, additionalProperties: false }, definitionSchema: prepareJsonSchema,
      instructions: 'Prepare a pinned private script as an immutable reusable dataset only on explicit user request. Code and declared files become part of the definition. Preparation stays private. The owner publishes organization visibility in Settings → Analytics; viewers still need upstream permissions. Use returned source and workspace_script.published_query in the dashboard. Never share the original Workspace directory.',
      inspect: async input => { emptyDiscoverySchema.parse(input); return { next: 'Choose exact artifactId/versionId from workspace_dataset_register. includeCodeAndFiles=true explicitly includes code and declared file bytes; no query rows are snapshotted.' } },
      prepare: async (input, context) => {
        const selected = prepareSchema.parse(input)
        const original = await this.definitions.open(context.actor, selected.artifactId, selected.versionId)
        if (original.mode !== 'pinned') throw new Error('WORKSPACE_SCRIPT_PIN_BEFORE_PUBLICATION')
        const files = this.runtime.require(WorkspaceFilesRuntimeCapability)
        const code = (await files.readBuffer(original.script)).buffer
        if (digest(code) !== original.scriptSha256) throw new Error('WORKSPACE_SCRIPT_CODE_CHANGED')
        const { authorization, script, ...definition } = original
        const published = publishedScriptSchema.parse({ ...definition, schema: 'xpert.published-analytics-script/v1',
          code: { content: new TextDecoder('utf-8', { fatal: true }).decode(code), sha256: digest(code) },
          files: await Promise.all(original.files.map(async file => {
            const bytes = (await files.readBuffer(file.reference)).buffer
            if (bytes.length > 150000) throw new Error('WORKSPACE_SCRIPT_PUBLICATION_FILE_LIMIT')
            return { alias: file.alias, content: new TextDecoder('utf-8', { fatal: true }).decode(bytes), sha256: digest(bytes) }
          })) })
        context.signal.throwIfAborted()
        await this.definitions.open(context.actor, selected.artifactId, selected.versionId)
        return this.validateConfiguration(analyticsOptionsSchema.parse(published), context.actor)
      }
    }
  }
  async validateConfiguration(options: Record<string, JSONValue>, actor: DataSourceActor) {
    const definition = publishedScriptSchema.parse(options)
    const sources = await this.runtime.require(AnalyticsRuntimeCapability).list(actor)
    for (const dependency of definition.sources) {
      const provider = sources.find(item => sameSource(item.source, dependency.binding.source))?.providers.find(item => item.id === dependency.binding.providerId)
      if (!provider || provider.sharing?.mode === 'owner_only') throw new Error(`WORKSPACE_SCRIPT_UPSTREAM_NOT_SHAREABLE: ${dependency.alias}`)
    }
    return analyticsOptionsSchema.parse(definition)
  }
  async discover(request: JSONValue, context: AnalyticsProviderContext) {
    emptyDiscoverySchema.parse(request)
    if (context.source.kind !== 'definition') throw new Error('WORKSPACE_SCRIPT_SOURCE_UNAVAILABLE')
    const definition = publishedScriptSchema.parse(context.options)
    const binding = { source: context.source, id: definition.output.datasetId, providerId: PUBLISHED_PROVIDER, operation: 'query', contractVersion: 1,
      payload: {}, parameters: definition.parameters, output: definition.output }
    return { items: [{ id: context.source.definitionId, name: definition.title, kind: 'dataset' as const, metadata: { binding: JSON.parse(JSON.stringify(binding)) } }],
      queryContract: { operation: 'query', contractVersion: 1, payloadSchema: { type: 'object', properties: {}, additionalProperties: false },
        instructions: 'Copy the canonical binding; its exact published definition version is immutable. Every upstream query runs as the current viewer.' } }
  }
  async execute(binding: AnalyticsBinding, parameters: Record<string, AnalyticsValue>, context: AnalyticsProviderContext) {
    emptyDiscoverySchema.parse(binding.payload)
    if (context.source.kind !== 'definition') throw new Error('WORKSPACE_SCRIPT_SOURCE_UNAVAILABLE')
    const definition = publishedScriptSchema.parse(context.options), source = context.source
    return executeScript(this.runtime, this.definitions, binding, parameters, context, definition, source.definitionId, source.versionId, {
      code: async () => Buffer.from(definition.code.content),
      file: async alias => {
        const file = definition.files.find(item => item.alias === alias)
        if (!file) throw new Error('WORKSPACE_SCRIPT_ALIAS_DENIED')
        return Buffer.from(file.content)
      },
      revalidate: async () => { await this.runtime.require(AnalyticsRuntimeCapability).discover(context.actor, { source, providerId: PUBLISHED_PROVIDER, request: {} }) }
    })
  }
}

function sameSource(left: AnalyticsBinding['source'], right: AnalyticsBinding['source']) {
  return left.kind === 'data-source' && right.kind === 'data-source' ? left.dataSourceId === right.dataSourceId :
    left.kind === 'definition' && right.kind === 'definition' ? left.definitionId === right.definitionId :
    left.kind === 'artifact' && right.kind === 'artifact' && left.artifactId === right.artifactId
}
