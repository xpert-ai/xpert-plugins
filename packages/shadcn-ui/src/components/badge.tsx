import * as React from 'react'
import { type VariantProps, cva } from 'class-variance-authority'
import { cn } from '../utils.js'

export const badgeVariants = cva('xps-badge', {
  variants: {
    variant: {
      default: 'xps-badge--default',
      secondary: 'xps-badge--secondary',
      success: 'xps-badge--success',
      warning: 'xps-badge--warning',
      destructive: 'xps-badge--destructive'
    }
  },
  defaultVariants: {
    variant: 'default'
  }
})

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>

export function Badge({ className, variant, ...props }: BadgeProps) {
  return React.createElement('span', {
    className: cn(badgeVariants({ variant }), className),
    ...props
  })
}
