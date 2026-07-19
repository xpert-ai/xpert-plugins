import { openComposition } from '@hyperframes/sdk'

/**
 * Open and serialize through the public SDK so the persisted source follows the
 * same document model used by HyperFrames tooling. Server validation remains
 * the authoritative production-render boundary.
 */
export async function normalizeHyperframesHtml(html: string) {
  const composition = await openComposition(html)
  try {
    return composition.serialize()
  } finally {
    composition.dispose()
  }
}

export async function inspectHyperframesHtml(html: string) {
  const composition = await openComposition(html)
  try {
    return {
      html: composition.serialize(),
      elementCount: composition.getElements().length,
      animationCount: composition.getAllAnimationIds().size
    }
  } finally {
    composition.dispose()
  }
}
