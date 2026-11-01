import { BadRequestException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { AnalyticsBinding, AnalyticsValue } from '@xpert-ai/contracts'
import { AnalyticsRuntimeCapability, ArtifactsRuntimeCapability, SandboxJobsRuntimeCapability,
  WorkspaceFilesRuntimeCapability, normalizeAnalyticsResult, isSandboxJobRuntimeError,
  type AnalyticsProviderContext, type AnalyticsProviderResult, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { PLUGIN, PROVIDER, PUBLISHED_PROVIDER, resultSchema, invocationSchema, type Definition } from './schema'
import { ScriptDefinitions, digest } from './definitions'
import { scriptFailureHint } from './diagnostics'

export type ExecutableScript = Pick<Definition, 'runtime' | 'title' | 'language' | 'mode' | 'scriptSha256' | 'sources' | 'parameters' | 'output'> & { files: Array<{ alias: string }> }
export interface ScriptAccess { code(): Promise<Buffer>; file(alias: string): Promise<Buffer>; authorizeFile?(alias: string): Promise<void>; revalidate(): Promise<void> }
/** Both private and published scripts use identical sandbox limits and current-viewer upstream queries. */
export async function executeScript(runtime: RuntimeCapabilityRegistry, definitions: ScriptDefinitions,
  binding: AnalyticsBinding, parameters: Record<string, AnalyticsValue>, context: AnalyticsProviderContext,
  definition: ExecutableScript, resourceId: string, versionId: string, access: ScriptAccess): Promise<AnalyticsProviderResult> {
    if (JSON.stringify(definition.output) !== JSON.stringify(binding.output) || JSON.stringify(definition.parameters) !== JSON.stringify(binding.parameters))
      throw new BadRequestException('WORKSPACE_SCRIPT_BINDING_CHANGED: copy the registered output and parameters exactly')
    if (definition.sources.some(source => [PROVIDER, PUBLISHED_PROVIDER].includes(source.binding.providerId))) throw new Error('WORKSPACE_SCRIPT_RECURSION_DENIED')
    const files = runtime.require(WorkspaceFilesRuntimeCapability), jobs = runtime.require(SandboxJobsRuntimeCapability)
    const code = await access.code(), codeHash = digest(code)
    if (!code.length || code.length > 64000 || (definition.mode === 'pinned' && codeHash !== definition.scriptSha256)) throw new Error('WORKSPACE_SCRIPT_CODE_CHANGED')
    // Snapshot current code once; its hash is checked again by Core at job materialization.
    const script = await definitions.store(context.actor, code, definition.language === 'python' ? 'script.py' : 'script.mjs')
    const fileCache = new Map<string, { text: string; sha256: string; fetchedAt: string }>()
    const lineage: Array<{ alias: string; executionId: string; sourceFetchedAt: string; truncated: boolean; upstreamExecutionId?: string }> = []
    let inputRows = 0
    const jobId = randomUUID(), startedAt = new Date().toISOString()
    context.signal.throwIfAborted()
    const timeoutMs = context.deadlineAt - Date.now() - 1500
    if (timeoutMs <= 0) throw new Error('WORKSPACE_SCRIPT_DEADLINE_EXCEEDED')
    const result = await jobs.run({ jobId, action: definition.runtime.action, actionVersion: definition.runtime.actionVersion,
      idempotencyKey: `workspace_script/${context.executionId}`, scope: { ...context.actor, pluginName: PLUGIN, businessResourceType: 'script', businessResourceId: resourceId },
      payload: { language: definition.language, parameters, outputKeys: definition.output.fields.map(field => field.sourceField) }, files: [{ reference: script, targetPath: 'script', size: code.length, sha256: codeHash }],
      timeoutMs, outputs: [{ path: 'dataset.json', originalName: 'dataset.json', mimeType: 'application/json',
        destination: { tenantId: context.actor.tenantId, userId: context.actor.userId, catalog: 'users', folder: `workspace-script/executions/${jobId}` } }] },
      { signal: context.signal, invocation: { operations: ['source.query', 'file.read'], maxCalls: 16, maxBytes: 8_000_000,
        handle: async (operation, input, invocation) => {
          invocation.signal.throwIfAborted()
          if (operation !== 'file.read' && operation !== 'source.query') throw new Error('WORKSPACE_SCRIPT_OPERATION_DENIED')
          const parsedRequest = invocationSchema.safeParse(input)
          if (!parsedRequest.success) throw new Error('WORKSPACE_SCRIPT_CONTROLS_INVALID')
          const request = parsedRequest.data
          // Revalidate the owning Assistant and Artifact on every invocation.
          await access.revalidate()
          if (operation === 'file.read') {
            if (Object.keys(request.controls).length) throw new Error('WORKSPACE_SCRIPT_FILE_PARAMETERS_DENIED')
            const file = definition.files.find(file => file.alias === request.alias)
            if (!file) throw new Error('WORKSPACE_SCRIPT_ALIAS_DENIED')
            await access.authorizeFile?.(request.alias)
            let value = fileCache.get(request.alias)
            if (!value) {
              const read = { buffer: await access.file(request.alias) }
              if (read.buffer.length > 1_000_000) throw new Error('WORKSPACE_SCRIPT_FILE_LIMIT')
              value = { text: new TextDecoder('utf-8', { fatal: true }).decode(read.buffer), sha256: digest(read.buffer), fetchedAt: new Date().toISOString() }
              fileCache.set(request.alias, value)
            }
            return value
          }
          const source = definition.sources.find(source => source.alias === request.alias)
          if (!source) throw new Error('WORKSPACE_SCRIPT_ALIAS_DENIED')
          const dataset = await runtime.require(AnalyticsRuntimeCapability).query(context.actor,
            { binding: source.binding, controls: request.controls }, { signal: invocation.signal, deadlineAt: context.deadlineAt, ancestry: context.ancestry })
          inputRows += dataset.rows.length
          if (inputRows > 4000) throw new Error('WORKSPACE_SCRIPT_INPUT_LIMIT')
          lineage.push({ alias: request.alias, executionId: dataset.provenance.executionId, sourceFetchedAt: dataset.freshness.sourceFetchedAt,
            truncated: dataset.completeness.scope !== 'full_query_result' || dataset.completeness.truncated, upstreamExecutionId: dataset.provenance.upstreamExecutionId })
          return JSON.parse(JSON.stringify(dataset))
        } } }).catch((error: unknown) => {
          if (!isSandboxJobRuntimeError(error)) throw error
          // Preserve typed failures with platform-owned, safe Analytics diagnostics.
          if (PLATFORM_SANDBOX_ERRORS.has(error.code)) throw error
          const hint = scriptFailureHint(error.message)
          const contracts = definition.sources.map(source => ({ alias: source.alias,
            controls: source.binding.parameters.map(parameter => parameter.controlId),
            rowKeys: source.binding.output.fields.map(field => field.id) }))
          throw new BadRequestException({ code: 'WORKSPACE_SCRIPT_EXECUTION_FAILED',
            message: `${error.code}: ${hint} Declared source contracts: ${JSON.stringify(contracts)}`, jobId })
        })
    const output = result.outputs[0]
    if (!output) throw new Error('WORKSPACE_SCRIPT_OUTPUT_UNAVAILABLE')
    let outputBytes: Buffer
    try { outputBytes = (await files.readBuffer(output.reference)).buffer }
    finally { await files.deleteFile(output.reference) }
    if (outputBytes.length > 2_000_000 || digest(outputBytes) !== output.sha256) throw new Error('WORKSPACE_SCRIPT_OUTPUT_CHANGED')
    const parsed = resultSchema.parse(JSON.parse(outputBytes.toString('utf8')))
    const truncated = lineage.some(item => item.truncated)
    const sourceFetchedAt = [...lineage.map(item => item.sourceFetchedAt), ...[...fileCache.values()].map(item => item.fetchedAt)].sort()[0] ?? startedAt
    const providerResult: AnalyticsProviderResult = { ...parsed, completeness: { returnedRows: parsed.rows.length,
      totalAccuracy: truncated ? 'unknown' : 'exact', scope: truncated ? 'page' : 'full_query_result', truncated,
      ...(!truncated ? { totalRows: parsed.rows.length } : {}) }, sourceFetchedAt, sourceVersion: `${versionId}:${codeHash}`, upstreamExecutionId: jobId }
    normalizeAnalyticsResult(binding, providerResult, context.executionId, context.maxRows)
    const evidence = Buffer.from(JSON.stringify({ schema: 'workspace-script.execution/v1', executionId: context.executionId, jobId, definition: context.source,
      scriptSha256: codeHash, parametersSha256: digest(JSON.stringify(parameters)), inputs: lineage,
      files: [...fileCache.entries()].map(([alias, value]) => ({ alias, sha256: value.sha256, fetchedAt: value.fetchedAt })), outputSha256: output.sha256, sourceFetchedAt }))
    const audit = await runtime.require(ArtifactsRuntimeCapability).createArtifact({ source: { pluginName: PLUGIN, resourceType: 'execution', resourceId: context.executionId },
      title: definition.title, kind: 'file', scope: context.actor })
    await runtime.require(ArtifactsRuntimeCapability).ensureArtifactVersion({ artifactId: audit.id, idempotencyKey: context.executionId,
      sha256: digest(evidence), mimeType: 'application/json', fileName: 'execution.json', workspaceFileRef: await definitions.store(context.actor, evidence, 'execution.json') })
    return { ...providerResult, auditRef: audit.id }
}

const PLATFORM_SANDBOX_ERRORS = new Set([
  'SANDBOX_ACTION_UNAVAILABLE', 'SANDBOX_ACTION_INVALID', 'SANDBOX_PROFILE_UNAVAILABLE',
  'SANDBOX_RUNTIME_UNAVAILABLE', 'SANDBOX_VERSION_MISMATCH', 'SANDBOX_START_FAILED',
  'SANDBOX_CAPACITY_UNAVAILABLE', 'EXPORT_INPUT_INVALID'
])
