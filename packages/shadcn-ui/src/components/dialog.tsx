import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '../utils.js'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogPortal = DialogPrimitive.Portal
export const DialogClose = DialogPrimitive.Close

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) =>
  React.createElement(DialogPrimitive.Overlay, {
    ref,
    className: cn('xps-dialog-overlay', className),
    ...props
  })
)
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    showClose?: boolean
  }
>(({ className, children, showClose = true, ...props }, ref) =>
  React.createElement(
    DialogPortal,
    null,
    React.createElement(DialogOverlay, null),
    React.createElement(
      DialogPrimitive.Content,
      {
        ref,
        className: cn('xps-dialog-content', className),
        ...props
      },
      children,
      showClose
        ? React.createElement(
            DialogPrimitive.Close,
            {
              className: 'xps-dialog-close'
            },
            React.createElement(X, {
              className: 'xps-icon',
              'aria-hidden': 'true'
            }),
            React.createElement('span', { className: 'xps-sr-only' }, 'Close')
          )
        : null
    )
  )
)
DialogContent.displayName = DialogPrimitive.Content.displayName

export const DialogHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) =>
    React.createElement('div', {
      ref,
      className: cn('xps-dialog-header', className),
      ...props
    })
)
DialogHeader.displayName = 'DialogHeader'

export const DialogFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) =>
    React.createElement('div', {
      ref,
      className: cn('xps-dialog-footer', className),
      ...props
    })
)
DialogFooter.displayName = 'DialogFooter'

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) =>
  React.createElement(DialogPrimitive.Title, {
    ref,
    className: cn('xps-dialog-title', className),
    ...props
  })
)
DialogTitle.displayName = DialogPrimitive.Title.displayName

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) =>
  React.createElement(DialogPrimitive.Description, {
    ref,
    className: cn('xps-dialog-description', className),
    ...props
  })
)
DialogDescription.displayName = DialogPrimitive.Description.displayName
