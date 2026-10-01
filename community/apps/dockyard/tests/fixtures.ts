import {
  DockingManager, LayoutRoot, LayoutPanel, LayoutDocumentPane, LayoutDocument,
  LayoutAnchorable, LayoutAnchorablePane, snapshot
} from '../vendor/dockyard/src/index.js'
import type { WorkspaceState, WorkspaceScope } from '../src/lib/domain/contracts.js'
import { optionsFromManager } from '../src/lib/domain/layout.js'

export const scope: WorkspaceScope = {
  tenantId: 'tenant-a', organizationId: 'org-a', userId: 'user-a', workspaceId: 'space-a', xpertId: 'assistant-a'
}
export function fixture() {
  const root = new LayoutRoot({ RootPanel: new LayoutPanel({ Children: [
    new LayoutAnchorablePane({ Children: [new LayoutAnchorable({ ContentId: 'explorer', Title: 'Explorer' })] }),
    new LayoutDocumentPane({ Children: [
      new LayoutDocument({ ContentId: 'workspace.js', Title: 'workspace.js', Content: { text: 'private document body' }, UserData: { secret: 'private metadata' } }),
      new LayoutDocument({ ContentId: 'preview', Title: 'Live preview' })
    ] }),
    new LayoutAnchorablePane({ Children: [
      new LayoutAnchorable({ ContentId: 'properties', Title: 'Properties' }),
      new LayoutAnchorable({ ContentId: 'tree', Title: 'Layout tree' })
    ] }),
    new LayoutAnchorablePane({ Children: [new LayoutAnchorable({ ContentId: 'output', Title: 'Output' })] })
  ] }) })
  const manager = new DockingManager({ Layout: root, AllowMixedOrientation: true })
  const state: WorkspaceState = {
    layoutJson: JSON.stringify(snapshot(root)), theme: 'dark', preset: 'development', options: optionsFromManager(manager)
  }
  return { manager, state }
}
