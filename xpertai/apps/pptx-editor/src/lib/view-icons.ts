import type { IconDefinition } from '@xpert-ai/contracts'

// Inline, theme-aware SVGs work in both hosts without a font or network request.
export const PRESENTATION_VIEW_ICON = {
  type: 'svg',
  value: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h18M12 3V1.5"/><rect x="4" y="3" width="16" height="12" rx="1.5" fill="currentColor" fill-opacity=".08"/><path d="M7.5 11l3-3 3 2 3-3M12 15v4m-4 3 4-3 4 3"/></svg>',
  alt: 'Presentation'
} satisfies IconDefinition

export const TEMPLATE_LIBRARY_VIEW_ICON = {
  type: 'svg',
  value: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h11a2 2 0 0 1 2 2v11"/><rect x="3" y="7" width="14" height="14" rx="2" fill="currentColor" fill-opacity=".08"/><path d="M3 12h14M9 12v9"/></svg>',
  alt: 'Presentation templates'
} satisfies IconDefinition
