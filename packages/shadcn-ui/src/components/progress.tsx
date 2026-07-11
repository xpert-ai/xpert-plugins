import * as React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'
import { cn } from '../utils.js'

export const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) =>
  React.createElement(ProgressPrimitive.Root, { ref, value, className: cn('xps-progress', className), ...props },
    React.createElement(ProgressPrimitive.Indicator, {
      className: 'xps-progress-indicator',
      style: { transform: `translateX(-${100 - Math.min(100, Math.max(0, value ?? 0))}%)` }
    })))
Progress.displayName = ProgressPrimitive.Root.displayName
