import * as React from 'react'
import { cn } from '../utils.js'

export const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(({ className, ...props }, ref) =>
  React.createElement('table', {
    ref,
    className: cn('xps-table', className),
    ...props
  })
)
Table.displayName = 'Table'

export const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) =>
    React.createElement('thead', {
      ref,
      className: cn('xps-table-header', className),
      ...props
    })
)
TableHeader.displayName = 'TableHeader'

export const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) =>
    React.createElement('tbody', {
      ref,
      className: cn('xps-table-body', className),
      ...props
    })
)
TableBody.displayName = 'TableBody'

export const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) =>
    React.createElement('tfoot', {
      ref,
      className: cn('xps-table-footer', className),
      ...props
    })
)
TableFooter.displayName = 'TableFooter'

export const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(({ className, ...props }, ref) =>
  React.createElement('tr', {
    ref,
    className: cn('xps-table-row', className),
    ...props
  })
)
TableRow.displayName = 'TableRow'

export const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) =>
    React.createElement('th', {
      ref,
      className: cn('xps-table-head', className),
      ...props
    })
)
TableHead.displayName = 'TableHead'

export const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) =>
    React.createElement('td', {
      ref,
      className: cn('xps-table-cell', className),
      ...props
    })
)
TableCell.displayName = 'TableCell'

export const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) =>
    React.createElement('caption', {
      ref,
      className: cn('xps-table-caption', className),
      ...props
    })
)
TableCaption.displayName = 'TableCaption'
