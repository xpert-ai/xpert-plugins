import * as React from 'react'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@xpert-ai/plugin-shadcn-ui'
import { translate } from './i18n'

type PanelApi = React.ComponentProps<typeof ResizablePanel>['panelRef'] extends React.Ref<infer T> | undefined ? T : never

export function WorkbenchLayout({ sidebar, children, collapsed, onCollapsedChange, zh }: {
  sidebar: React.ReactNode
  children: React.ReactNode
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  zh: boolean
}) {
  const sidebarRef = React.useRef<PanelApi>(null)
  React.useEffect(() => {
    if (collapsed) sidebarRef.current?.collapse()
    else sidebarRef.current?.expand()
  }, [collapsed])

  return (
    <ResizablePanelGroup orientation="horizontal" className="workspace-panels">
      <ResizablePanel id="connections" className="workspace-panel" style={{ overflow: 'hidden' }} panelRef={sidebarRef}
        defaultSize={235} minSize={165} maxSize="45%" collapsible collapsedSize={44}
        groupResizeBehavior="preserve-pixel-size"
        onResize={(size) => {
          if (size.inPixels > 0 && (size.inPixels <= 45) !== collapsed) onCollapsedChange(size.inPixels <= 45)
        }}>
        {sidebar}
      </ResizablePanel>
      <ResizableHandle className="studio-resize-handle" aria-label={translate(zh, 'resize_sidebar')}
        title={translate(zh, 'resize_sidebar')} />
      <ResizablePanel id="query-workspace" minSize="55%" className="workspace-panel" style={{ overflow: 'hidden' }}>
        {children}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

export function SidebarLayout({ objects, navigation, zh }: {
  objects: React.ReactNode
  navigation: React.ReactNode
  zh: boolean
}) {
  return (
    <ResizablePanelGroup orientation="vertical" className="sidebar-panels">
      <ResizablePanel id="database-objects" minSize={80} className="sidebar-objects" style={{ overflow: 'hidden' }}>
        {objects}
      </ResizablePanel>
      <ResizableHandle className="studio-resize-handle" aria-label={translate(zh, 'resize_sidebar_sections')}
        title={translate(zh, 'resize_sidebar_sections')} />
      <ResizablePanel id="collections" defaultSize={236} minSize={80} style={{ overflow: 'hidden' }}>
        {navigation}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
