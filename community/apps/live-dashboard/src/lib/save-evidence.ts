import { createHash } from 'node:crypto'
import { createMutationEvidence, type WorkspaceFilesApi } from '@xpert-ai/plugin-sdk'
import { createdDashboard, savedDashboardSource } from './dashboard-receipt'

/** A domain receipt covers only the exact edited file bytes consumed by that save. */
export function dashboardSaveEvidence(files: () => WorkspaceFilesApi) {
  const saves = createMutationEvidence<NonNullable<ReturnType<typeof createdDashboard>>>()
  const edits = new Map<string, { artifactId?: string; generation: number; pending: boolean }>()
  const activeWrites = new Map<string, number>()
  const fingerprint = async (path: string) => {
    try { return createHash('sha256').update((await files().readRuntimeBuffer(path)).buffer).digest('hex') }
    catch { return undefined } // An unreadable file cannot establish that a mutation was a no-op.
  }
  return {
    opened(path: string, artifactId: string) { edits.set(path, { artifactId, generation: 0, pending: false }) },
    has(path: string) { return edits.has(path) },
    write(path: string) {
      const edit = edits.get(path) ?? { generation: 0, pending: false }
      edits.set(path, { ...edit, generation: edit.generation + 1, pending: true })
    },
    async trackWrite<T>(path: string, run: () => Promise<T>): Promise<T> {
      // A receipt cannot confirm bytes while any writer may still change this path.
      activeWrites.set(path, (activeWrites.get(path) ?? 0) + 1)
      try {
        const before = await fingerprint(path), previous = edits.get(path)
        const edit = { ...previous, generation: (previous?.generation ?? 0) + 1, pending: true }
        edits.set(path, edit)
        try { return await run() }
        finally {
          // File tools may return a domain error with status=success. Verify bytes rather than
          // guessing from tool names/error text; preserve earlier or concurrent unsaved edits.
          if (before !== undefined && before === await fingerprint(path) && edits.get(path) === edit) {
            if (previous) edits.set(path, previous)
            else edits.delete(path)
          }
        }
      } finally {
        const remaining = activeWrites.get(path)! - 1
        if (remaining) activeWrites.set(path, remaining)
        else activeWrites.delete(path)
      }
    },
    beginSave() {
      return { token: saves.begin(), generations: new Map([...edits].map(([path, edit]) => [path, edit.generation])) }
    },
    async accept(save: { token: number; generations: Map<string, number> }, output: unknown) {
      const receipt = createdDashboard(output)
      if (!receipt) return
      saves.accept(save.token, receipt)
      const source = savedDashboardSource(output)
      if (!source) return
      const edit = edits.get(source.path)
      if (!edit || activeWrites.has(source.path) || save.generations.get(source.path) !== edit.generation || edit.artifactId && edit.artifactId !== receipt.artifactId) return
      const current = await files().readRuntimeBuffer(source.path)
      if (!activeWrites.has(source.path) && edits.get(source.path) === edit && createHash('sha256').update(current.buffer).digest('hex') === source.sha256)
        edit.pending = false
    },
    get pending() { return saves.pending || activeWrites.size > 0 || [...edits.values()].some(edit => edit.pending) },
    get pendingPaths() { return [...new Set([...activeWrites.keys(), ...[...edits].filter(([, edit]) => edit.pending).map(([path]) => path)])] }
  }
}
