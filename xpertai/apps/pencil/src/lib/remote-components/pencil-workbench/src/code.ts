import type { JSXFormat } from '@open\u002dpencil/core/design-jsx'

export type PencilCodeFormat = 'pencil' | 'tailwind'

export const PENCIL_JSX_REFERENCE = `# Pencil JSX Reference

Use JSX elements such as Frame, Text, Rectangle, Ellipse, Line, Vector, Group, Section, Component, and Instance.

Common layout props:
- flex="row" or flex="col" for auto-layout direction
- gap, rowGap, columnGap, p, px, py, pt, pr, pb, pl for spacing
- justify="start|center|end|between" and items="start|center|end|stretch" for alignment
- w, h, minW, maxW, minH, maxH, grow for sizing

Common appearance props:
- bg or fill for solid fills
- color for text color
- stroke, strokeWidth, rounded, opacity, shadow, blur

Example:
<Frame name="Card" flex="col" gap={12} p={16} w={320} bg="#FFFFFF" rounded={16}>
  <Text name="Title" size={20} weight="bold" color="#111827">Revenue dashboard</Text>
  <Text name="Body" size={14} color="#6B7280">Live pipeline and risk signals.</Text>
</Frame>`

/**
 * Keeps the UI product name decoupled from the upstream renderer's historical format literal.
 */
export function toCoreJsxFormat(format: PencilCodeFormat): JSXFormat {
  return format === 'tailwind' ? 'tailwind' : 'openpencil'
}

/** Normalizes selection order and removes ids that no longer exist in the active graph. */
export function codeTargetIds(selectedIds: Iterable<string>, exists: (id: string) => boolean): string[] {
  const unique = new Set<string>()
  for (const id of selectedIds) {
    if (id && exists(id)) {
      unique.add(id)
    }
  }
  return Array.from(unique)
}
