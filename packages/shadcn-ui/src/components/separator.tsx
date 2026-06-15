import * as React from 'react'
import { cn } from '../utils.js'

export type SeparatorProps = React.HTMLAttributes<HTMLDivElement> & {
  orientation?: 'horizontal' | 'vertical'
}

export const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className, orientation = 'horizontal', ...props }, ref) => (
    React.createElement('div', {
      ref,
      className: cn('xps-separator', orientation === 'vertical' ? 'xps-separator--vertical' : 'xps-separator--horizontal', className),
      role: 'separator',
      'aria-orientation': orientation,
      ...props
    })
  )
)
Separator.displayName = 'Separator'
