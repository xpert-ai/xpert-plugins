import { DockingManager, hydrate } from '../../../vendor/dockyard/src/index.js'
import { DockyardError, workspaceStateSchema } from './contracts.js'
import type { ManagerOptions, WorkspaceState } from './contracts.js'

export function validateWorkspace(state: WorkspaceState): WorkspaceState {
  const parsed = workspaceStateSchema.parse(state)
  try { hydrate(parsed.layoutJson) } catch { throw new DockyardError('invalid_layout') }
  return parsed
}

export function optionsFromManager(manager: DockingManager): ManagerOptions {
  return { allowMixedOrientation: manager.AllowMixedOrientation,
    floatingWindowMinWidth: manager.FloatingWindowMinWidth,
    floatingWindowMinHeight: manager.FloatingWindowMinHeight }
}
