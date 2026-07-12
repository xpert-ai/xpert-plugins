import * as React from 'react'
import { Panel, PanelGroup, PanelResizeHandle, type PanelGroupProps, type PanelResizeHandleProps } from 'react-resizable-panels'
import { GripVertical } from 'lucide-react'
import { cn } from '../utils.js'

export const ResizablePanelGroup = React.forwardRef<React.ElementRef<typeof PanelGroup>, PanelGroupProps>(
  ({ className, ...props }, ref) => React.createElement(PanelGroup, { ref, className: cn('xps-resizable-group', className), ...props })
)
ResizablePanelGroup.displayName = 'ResizablePanelGroup'

export const ResizablePanel = Panel

export function ResizableHandle({ className, withHandle, ...props }: PanelResizeHandleProps & { withHandle?: boolean }) {
  return React.createElement(PanelResizeHandle, { className: cn('xps-resizable-handle', className), ...props },
    withHandle ? React.createElement('div', { className: 'xps-resizable-grip' }, React.createElement(GripVertical, { className: 'xps-icon' })) : null)
}
