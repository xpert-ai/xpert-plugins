import { fontManager } from '@open\u002dpencil/core'
import { CJK_FONT_CHUNK_URLS } from 'pencil-cjk-font-chunks'

import interBoldUrl from './Inter-Bold.ttf'
import interExtraBoldUrl from './Inter-ExtraBold.ttf'
import interMediumUrl from './Inter-Medium.ttf'
import interRegularUrl from './Inter-Regular.ttf'
import interSemiBoldUrl from './Inter-SemiBold.ttf'
import notoNaskhArabicRegularUrl from './NotoNaskhArabic-Regular.ttf'

const FONT_URLS: Record<string, string> = {
  'Inter|Regular': interRegularUrl,
  'Inter|Medium': interMediumUrl,
  'Inter|SemiBold': interSemiBoldUrl,
  'Inter|Bold': interBoldUrl,
  'Inter|ExtraBold': interExtraBoldUrl,
  'Noto Naskh Arabic|Regular': notoNaskhArabicRegularUrl
}

const fontDataCache = new Map<string, ArrayBuffer>()
const CJK_FONT_ALIAS_PREFIX = 'Pencil CJK'
const CJK_FONT_STYLE = 'Regular'

let installed = false
let preparationPromise: Promise<void> | null = null

export function installPencilFontCache() {
  if (installed) {
    return
  }
  installed = true
  fontManager.setDownloadedFontCache({
    async read(family: string, style: string) {
      const key = `${family}|${style}`
      const url = FONT_URLS[key]
      if (!url) {
        return null
      }
      const cached = fontDataCache.get(key)
      if (cached) {
        return cached.slice(0)
      }
      const response = await fetch(url)
      if (!response.ok) {
        return null
      }
      const data = await response.arrayBuffer()
      fontDataCache.set(key, data)
      return data.slice(0)
    },
    async write(family: string, style: string, data: ArrayBuffer) {
      fontDataCache.set(`${family}|${style}`, data.slice(0))
    }
  })
}

/**
 * Preloads deterministic CJK fallback fonts before CanvasKit creates its font providers.
 * Each unicode-range chunk gets a unique family alias so Skia can fall through every subset.
 */
export function preparePencilFonts() {
  installPencilFontCache()
  preparationPromise ??= preloadCJKFontChunks()
  return preparationPromise
}

async function preloadCJKFontChunks() {
  const chunks = await Promise.allSettled(
    CJK_FONT_CHUNK_URLS.map(async (url) => {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`CJK font chunk request failed with status ${response.status}.`)
      }
      return response.arrayBuffer()
    })
  )

  let loadedCount = 0
  chunks.forEach((result, index) => {
    if (result.status !== 'fulfilled') {
      return
    }
    const family = `${CJK_FONT_ALIAS_PREFIX} ${String(index + 1).padStart(3, '0')}`
    fontManager.markLoaded(family, CJK_FONT_STYLE, result.value)
    fontManager.setCJKFallbackFamily(family)
    loadedCount += 1
  })

  if (!loadedCount) {
    throw new Error('Bundled CJK fonts could not be loaded.')
  }
}
