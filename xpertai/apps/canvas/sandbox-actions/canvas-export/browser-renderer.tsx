import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { TldrawImage } from 'tldraw'
import type { TLPageId, TLStoreSnapshot } from 'tldraw'
import 'tldraw/tldraw.css'
import fontRegular from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2'
import fontBold from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff2'

type RenderInput = { snapshot: TLStoreSnapshot; pageId: string }
type RenderResult = { svg: string; width: number; height: number }

declare global {
  interface Window {
    __xpertCanvasRender?: (input: RenderInput) => Promise<RenderResult>
  }
}

const fonts = {
  tldraw_mono: fontRegular,
  tldraw_mono_italic: fontRegular,
  tldraw_mono_bold: fontBold,
  tldraw_mono_italic_bold: fontBold,
  tldraw_serif: fontRegular,
  tldraw_serif_italic: fontRegular,
  tldraw_serif_bold: fontBold,
  tldraw_serif_italic_bold: fontBold,
  tldraw_sans: fontRegular,
  tldraw_sans_italic: fontRegular,
  tldraw_sans_bold: fontBold,
  tldraw_sans_italic_bold: fontBold,
  tldraw_draw: fontRegular,
  tldraw_draw_italic: fontRegular,
  tldraw_draw_bold: fontBold,
  tldraw_draw_italic_bold: fontBold
}

window.__xpertCanvasRender = async ({ snapshot, pageId }) => {
  const host = document.getElementById('canvas-render-root')
  if (!host) throw new Error('EXPORT_OUTPUT_INVALID: Canvas render root is missing.')
  const root = createRoot(host)
  try {
    root.render(
      <TldrawImage
        snapshot={snapshot}
        pageId={pageId as TLPageId}
        format="svg"
        background
        darkMode={false}
        padding={32}
        preserveAspectRatio="xMidYMid meet"
        assetUrls={{ fonts }}
      />
    )
    const image = await waitForImage(host)
    const response = await fetch(image.src)
    if (!response.ok) throw new Error(`EXPORT_OUTPUT_INVALID: SVG blob could not be read (${response.status}).`)
    const svg = await response.text()
    const dimensions = readDimensions(svg)
    return { svg, ...dimensions }
  } finally {
    root.unmount()
  }
}

function waitForImage(host: HTMLElement) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const existing = host.querySelector('img')
    if (existing?.src) return resolve(existing)
    const observer = new MutationObserver(() => {
      const image = host.querySelector('img')
      if (!image?.src) return
      window.clearTimeout(timer)
      observer.disconnect()
      resolve(image)
    })
    const timer = window.setTimeout(() => {
      observer.disconnect()
      reject(new Error('EXPORT_TIMEOUT: tldraw did not produce an SVG within 90 seconds.'))
    }, 90_000)
    observer.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] })
  })
}

function readDimensions(svg: string) {
  const start = svg.match(/^\s*(?:<\?xml[^>]*>\s*)?<svg\b[^>]*>/i)?.[0]
  if (!start) throw new Error('EXPORT_OUTPUT_INVALID: tldraw returned invalid SVG markup.')
  const width = Number(start.match(/\bwidth=["']([0-9.]+)(?:px)?["']/i)?.[1])
  const height = Number(start.match(/\bheight=["']([0-9.]+)(?:px)?["']/i)?.[1])
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('EXPORT_OUTPUT_INVALID: tldraw SVG dimensions are invalid.')
  }
  return { width, height }
}

export {}
