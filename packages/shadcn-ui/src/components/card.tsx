import * as React from 'react'
import { cn } from '../utils.js'

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  React.createElement('div', {
    ref,
    className: cn('xps-card', className),
    ...props
  })
))
Card.displayName = 'Card'

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  React.createElement('div', {
    ref,
    className: cn('xps-card-header', className),
    ...props
  })
))
CardHeader.displayName = 'CardHeader'

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) =>
    React.createElement('h3', {
      ref,
      className: cn('xps-card-title', className),
      ...props
    })
)
CardTitle.displayName = 'CardTitle'

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) =>
    React.createElement('p', {
      ref,
      className: cn('xps-card-description', className),
      ...props
    })
)
CardDescription.displayName = 'CardDescription'

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  React.createElement('div', {
    ref,
    className: cn('xps-card-content', className),
    ...props
  })
))
CardContent.displayName = 'CardContent'
