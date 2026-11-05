import type { AnalyticalDataset } from '@xpert-ai/contracts'
import { createArtifactQueryScheduler, type ArtifactQueryInput, type ArtifactQueryPriority } from '@xpert-ai/plugin-sdk/artifact-document'
import type { DashboardManifest } from './dashboard.schema'
import { sourceDatasetSchema, type SourceEvent } from './source-executions'

/** One saved definition and actor. No cache survives a navigation or a version change. */
export function createDashboardQuerySession(manifest: DashboardManifest, execute: (input: ArtifactQueryInput) => Promise<AnalyticalDataset>,
  changed: (datasets: AnalyticalDataset[], failures: string[]) => void, event: (event: SourceEvent) => void, busy: (value: boolean) => void) {
  const results = new Map<string, AnalyticalDataset>(), failures = new Set<string>()
  const keys = new Map<string, string>(), requests = new Map<string, string>(), pending = new Set<string>()
  let sequence = 0, disposed = false
  const publish = () => { if (!disposed) changed([...results.values()], [...failures]) }
  const scheduler = createArtifactQueryScheduler({ execute, onBusy: busy, onState: state => {
    if (disposed || !['queued', 'running'].includes(state.state)) return
    event({ type: state.state === 'queued' ? 'queue' : 'start', bindingId: state.bindingId,
      requestId: requests.get(state.bindingId)!, controls: state.controls, at: new Date(state.state === 'queued' ? state.queuedAt : state.startedAt!).toISOString() })
  } })
  return {
    async query(values: ArtifactQueryInput['controls'], priority: ArtifactQueryPriority = 'interactive', only?: string[]) {
      const affected = manifest.bindings.flatMap(binding => {
        if (only && !only.includes(binding.id)) return []
        const controls = Object.fromEntries(binding.parameters.map(parameter => [parameter.controlId,
          Object.hasOwn(values, parameter.controlId) ? values[parameter.controlId] : parameter.defaultValue ?? null]))
        const key = JSON.stringify(controls)
        if (priority === 'interactive' && keys.get(binding.id) === key && !failures.has(binding.output.datasetId)) return []
        // A repeated refresh shares both the physical query and its Sources lifecycle.
        const requestId = keys.get(binding.id) === key && pending.has(binding.id) ? requests.get(binding.id)! : String(++sequence)
        keys.set(binding.id, key)
        pending.add(binding.id)
        requests.set(binding.id, requestId)
        results.delete(binding.output.datasetId)
        failures.delete(binding.output.datasetId)
        return [{ binding, controls, requestId }]
      })
      // Remove every affected old-parameter dataset before publishing any new result.
      publish()
      await Promise.all(affected.map(async ({ binding, controls, requestId }) => {
        try {
          const result = await scheduler.query({ bindingId: binding.id, controls }, priority)
          if (disposed || requests.get(binding.id) !== requestId) return
          results.set(binding.output.datasetId, result)
          if (new TextEncoder().encode(JSON.stringify([...results.values()])).byteLength > 3_000_000) {
            results.delete(binding.output.datasetId)
            throw new Error('DASHBOARD_RESULT_TOO_LARGE')
          }
          event({ type: 'success', bindingId: binding.id, requestId, result: sourceDatasetSchema.parse(result), at: new Date().toISOString() })
        } catch {
          if (disposed || requests.get(binding.id) !== requestId) return
          failures.add(binding.output.datasetId)
          event({ type: 'failure', bindingId: binding.id, requestId, at: new Date().toISOString() })
        }
        pending.delete(binding.id)
        publish()
      }))
    },
    dispose() { disposed = true; scheduler.dispose(); results.clear(); requests.clear(); keys.clear(); pending.clear() }
  }
}
