import { Inject } from '@nestjs/common'
import type { AnalyticsBinding, AnalyticsProviderDescriptor, AnalyticsValue, AnalyticsDiscoveryResult, JSONValue } from '@xpert-ai/contracts'
import { AnalyticsProvider,
  WorkspaceFilesRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type AnalyticsQueryProvider, type AnalyticsProviderContext, type AnalyticsProviderResult, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { PLUGIN, PROVIDER, emptyDiscoverySchema } from './schema'
import { ScriptDefinitions } from './definitions'
import { executeScript } from './execution'

@AnalyticsProvider(PROVIDER)
export class WorkspaceScriptProvider implements AnalyticsQueryProvider {
  readonly descriptor: AnalyticsProviderDescriptor = {
    id: PROVIDER, name: 'Workspace Python / JavaScript', sourceKinds: ['artifact'],
    sharing: { mode: 'owner_only', reasonCode: 'WORKSPACE_SCRIPT_PRIVATE_DEPENDENCIES' },
    operations: [{ name: 'query', contractVersion: 1, readOnly: true }]
  }
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry, private readonly definitions: ScriptDefinitions) {}
  readonly configuration = { kind: 'artifact' as const, pluginName: PLUGIN, resourceType: 'definition', registrationTool: 'workspace_dataset_register' }
  async discover(request: JSONValue, context: AnalyticsProviderContext): Promise<AnalyticsDiscoveryResult> {
    emptyDiscoverySchema.parse(request)
    if (context.source.kind !== 'artifact') throw new Error('WORKSPACE_SCRIPT_SOURCE_UNAVAILABLE')
    const { artifactId, versionId } = context.source
    const definition = await this.definitions.open(context.actor, artifactId, versionId)
    return { items: [{ id: artifactId, name: definition.title, kind: 'dataset', metadata: { binding: JSON.parse(JSON.stringify(this.definitions.binding(artifactId, versionId, definition))) } }],
      queryContract: { operation: 'query', contractVersion: 1, payloadSchema: { type: 'object', properties: {}, additionalProperties: false }, instructions: 'Copy the canonical Binding. The exact script definition is pinned by source.artifactId/versionId. Parameters and output must match the registered definition.' } }
  }
  async execute(binding: AnalyticsBinding, parameters: Record<string, AnalyticsValue>, context: AnalyticsProviderContext): Promise<AnalyticsProviderResult> {
    context.signal.throwIfAborted()
    emptyDiscoverySchema.parse(binding.payload)
    if (context.source.kind !== 'artifact') throw new Error('WORKSPACE_SCRIPT_SOURCE_UNAVAILABLE')
    const payload = context.source, definition = await this.definitions.open(context.actor, payload.artifactId, payload.versionId)
    const files = this.runtime.require(WorkspaceFilesRuntimeCapability)
    return executeScript(this.runtime, this.definitions, binding, parameters, context, definition, payload.artifactId, payload.versionId, {
      code: async () => (await files.readBuffer(definition.script)).buffer,
      authorizeFile: async alias => {
        const file = definition.files.find(item => item.alias === alias)
        if (!file) throw new Error('WORKSPACE_SCRIPT_ALIAS_DENIED')
        await files.resolveFile(file.reference)
      },
      file: async alias => {
        const file = definition.files.find(item => item.alias === alias)
        if (!file) throw new Error('WORKSPACE_SCRIPT_ALIAS_DENIED')
        return (await files.readBuffer(file.reference)).buffer
      },
      revalidate: async () => { await this.definitions.open(context.actor, payload.artifactId, payload.versionId) }
    })
  }
}
