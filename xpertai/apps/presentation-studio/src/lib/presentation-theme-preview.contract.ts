export const PRESENTATION_DECK_KINDS = ['standard', 'theme_preview'] as const
export type PresentationDeckKind = (typeof PRESENTATION_DECK_KINDS)[number]

export const PRESENTATION_THEME_PREVIEW_DECK_KIND: PresentationDeckKind = 'theme_preview'
export const PRESENTATION_STANDARD_DECK_KIND: PresentationDeckKind = 'standard'
export const PRESENTATION_THEME_PREVIEW_SLIDE_KIND = 'theme_preview_image'
export const PRESENTATION_SYSTEM_SLIDE_KIND_PROP = '__presentationSlideKind'
export const PRESENTATION_SYSTEM_IMAGE_ASSET_PROP = '__presentationImageAsset'
export const PRESENTATION_SYSTEM_IMAGE_ALT_PROP = '__presentationImageAlt'

export function presentationDeckKind(value: unknown): PresentationDeckKind {
  return value === PRESENTATION_THEME_PREVIEW_DECK_KIND
    ? PRESENTATION_THEME_PREVIEW_DECK_KIND
    : PRESENTATION_STANDARD_DECK_KIND
}

export function themePreviewSlideFromProps(props: Record<string, unknown>) {
  if (props[PRESENTATION_SYSTEM_SLIDE_KIND_PROP] !== PRESENTATION_THEME_PREVIEW_SLIDE_KIND) return null
  const image = props[PRESENTATION_SYSTEM_IMAGE_ASSET_PROP]
  const alt = props[PRESENTATION_SYSTEM_IMAGE_ALT_PROP]
  return {
    image: typeof image === 'string' ? image : '',
    alt: typeof alt === 'string' ? alt : ''
  }
}
