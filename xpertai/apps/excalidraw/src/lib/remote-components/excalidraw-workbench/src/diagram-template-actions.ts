export function decideTemplateInstantiation(input: {
  applyToCurrent: boolean
  selectedDrawingId?: string | null
  dirty: boolean
}) {
  if (!input.applyToCurrent) return { allowed: true, blockReason: null, requiresConfirmation: false } as const
  if (!input.selectedDrawingId) return { allowed: false, blockReason: 'no-drawing', requiresConfirmation: false } as const
  if (input.dirty) return { allowed: false, blockReason: 'dirty', requiresConfirmation: false } as const
  return { allowed: true, blockReason: null, requiresConfirmation: true } as const
}

export function decideDiagramIrRerender(input: {
  selectedDrawingId?: string | null
  revision?: number | null
  dirty: boolean
  diverged: boolean
}) {
  if (!input.selectedDrawingId || !input.revision) return { allowed: false, blockReason: 'unavailable', requiresConfirmation: false } as const
  if (input.dirty) return { allowed: false, blockReason: 'dirty', requiresConfirmation: false } as const
  return { allowed: true, blockReason: null, requiresConfirmation: input.diverged } as const
}
