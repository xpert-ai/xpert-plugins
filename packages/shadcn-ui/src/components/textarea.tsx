import * as React from 'react'
import { cn } from '../utils.js'

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  React.createElement('textarea', {
    ref,
    className: cn('xps-textarea', className),
    ...props
  })
))
Textarea.displayName = 'Textarea'
