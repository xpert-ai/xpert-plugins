import type { TLUiAssetUrlOverrides } from 'tldraw'
import catalogs from 'virtual:canvas-tldraw-translations'

// Use tldraw's public assetUrls API. Data URLs work offline and do not need
// object-URL disposal, a fetch override, or a remount when the locale changes.
export const canvasTranslationAssetUrls = Object.freeze(Object.fromEntries(
  Object.entries(catalogs).map(([locale, messages]) => [
    locale, `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(messages))}`
  ])
)) satisfies NonNullable<TLUiAssetUrlOverrides['translations']>
