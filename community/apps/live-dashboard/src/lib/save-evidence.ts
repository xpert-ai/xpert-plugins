import { createHash } from 'node:crypto'
import { createMutationEvidence, type WorkspaceFilesApi } from '@xpert-ai/plugin-sdk'
import { createdDashboard, savedDashboardSource } from './dashboard-receipt'

/** A domain receipt covers only the exact edited file bytes consumed by that save. */
export function dashboardSaveEvidence(files: () => WorkspaceFilesApi) {
  const saves = createMutationEvidence<NonNullable<ReturnType<typeof createdDashboard>>>()
  const edits = new Map<string, { artifactId?: string; generation: number; pending: boolean }>()
  return {
    opened(path: string, artifactId: string) { edits.set(path, { artifactId, generation: 0, pending: false }) },
    has(path: string) { return edits.has(path) },
    write(path: string) {
      const edit = edits.get(path) ?? { generation: 0, pending: false }
      edits.set(path, { ...edit, generation: edit.generation + 1, pending: true })
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
      if (!edit || save.generations.get(source.path) !== edit.generation || edit.artifactId && edit.artifactId !== receipt.artifactId) return
      const current = await files().readRuntimeBuffer(source.path)
      if (edits.get(source.path) === edit && createHash('sha256').update(current.buffer).digest('hex') === source.sha256)
        edit.pending = false
    },
    get pending() { return saves.pending || [...edits.values()].some(edit => edit.pending) },
    get pendingPaths() { return [...edits].filter(([, edit]) => edit.pending).map(([path]) => path) }
  }
}
