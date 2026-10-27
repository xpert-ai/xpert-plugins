import type { IconDefinition } from '@xpert-ai/contracts'

/** A material block with one shared identity core; also rendered at tool-row sizes. */
export const MATERIAL_IDENTITY_LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="15" fill="#2457A7"/><path fill="#FFF" fill-rule="evenodd" d="M32 10 51 21 32 32 13 21 32 10Zm0 8-5.2 3L32 24l5.2-3L32 18Z" clip-rule="evenodd"/><path d="m13 27 15 8.7V54l-15-8.7V27Z" fill="#FFF"/><path d="m36 35.7 15-8.7v18.3L36 54V35.7Z" fill="#8DD8F8"/></svg>'

export const APP_ICON = {
  type: 'svg',
  value: MATERIAL_IDENTITY_LOGO_SVG,
  alt: 'Material Identity Governance',
} satisfies IconDefinition

export const MATERIAL_IDENTITY_LOGO_URL = `data:image/svg+xml,${encodeURIComponent(MATERIAL_IDENTITY_LOGO_SVG)}`
export const MATERIAL_IDENTITY_LOGO_PATH = './assets/brand/material-identity-icon.svg'
