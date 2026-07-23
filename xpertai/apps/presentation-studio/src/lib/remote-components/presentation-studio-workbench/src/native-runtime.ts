import type { EditorState, JsonObject, NativeThemeRuntimePayload } from './types'

export interface DashiRuntimeBridge {
  getState(): Pick<EditorState, 'props' | 'text'>
  peek(key: 'props' | 'text'): EditorState['props'] | EditorState['text']
  setProps(slideId: string, props: JsonObject): void
  setTextState(text: Record<string, string>): void
}

type RuntimeWindow = Window & {
  __deckViewModel?: DashiRuntimeBridge
  __renderRuntimeSlide?: (slide: HTMLElement, props?: JsonObject, options?: { trusted?: boolean }) => boolean
  __releaseRuntimeSlide?: (slide: HTMLElement) => boolean
  __getVisibleSlides?: () => HTMLElement[]
  __getDeckPageNumberForSlide?: (slide: HTMLElement) => { current: number; total: number } | null
  __syncDeckPageNumbers?: (slide: HTMLElement) => void
  __initEditableText?: (slide: HTMLElement) => void
  __syncActiveEffects?: (slide: HTMLElement, options?: JsonObject) => void
  __markOverviewThumbDirty?: (slide: HTMLElement) => void
  __isDeckFileSlotTarget?: (element: Element) => boolean
}

export interface LoadedNativeRuntime {
  checksum: string
  themePack: string
  styleText: string
  styleBaseline: ReadonlySet<HTMLStyleElement>
}

let activeRuntime: Promise<LoadedNativeRuntime> | null = null
let activeChecksum = ''

export async function loadNativeThemeRuntime(payload: NativeThemeRuntimePayload) {
  if (activeRuntime && activeChecksum === payload.runtimeChecksum) return activeRuntime
  activeChecksum = payload.runtimeChecksum
  activeRuntime = activateRuntime(payload).catch((error) => {
    activeChecksum = ''
    activeRuntime = null
    throw error
  })
  return activeRuntime
}

export function installDashiRuntimeBridge(bridge: DashiRuntimeBridge) {
  const runtimeWindow = window as RuntimeWindow
  runtimeWindow.__deckViewModel = bridge
  runtimeWindow.__getVisibleSlides = () => Array.from(document.querySelectorAll<HTMLElement>('[data-presentation-native-slide]'))
  runtimeWindow.__getDeckPageNumberForSlide = (slide) => {
    const current = Number(slide.dataset.vmIndex)
    const total = Number(slide.dataset.vmTotal)
    return Number.isFinite(current) && Number.isFinite(total) ? { current: current + 1, total } : null
  }
  runtimeWindow.__syncDeckPageNumbers = () => undefined
  runtimeWindow.__initEditableText = () => undefined
  runtimeWindow.__syncActiveEffects = () => undefined
  runtimeWindow.__markOverviewThumbDirty = () => undefined
  runtimeWindow.__isDeckFileSlotTarget = (element) => Boolean(element.closest('image-slot,.gxn-slot,[data-dashi-media-slot]'))
  return () => {
    if (runtimeWindow.__deckViewModel === bridge) delete runtimeWindow.__deckViewModel
  }
}

export function renderNativeSlide(slide: HTMLElement, props: JsonObject) {
  const runtime = window as RuntimeWindow
  if (!runtime.__renderRuntimeSlide) throw new Error('The native presentation theme runtime is not loaded.')
  return runtime.__renderRuntimeSlide(slide, props, { trusted: true })
}

export function releaseNativeSlide(slide: HTMLElement) {
  return (window as RuntimeWindow).__releaseRuntimeSlide?.(slide) ?? false
}

export function collectNativeRuntimeStyleText(runtime: LoadedNativeRuntime) {
  return Array.from(document.head.querySelectorAll('style'))
    .filter((style) => !runtime.styleBaseline.has(style))
    .map((style) => style.textContent ?? '')
    .join('\n')
}

async function activateRuntime(payload: NativeThemeRuntimePayload): Promise<LoadedNativeRuntime> {
  if (payload.protocolVersion !== 1 || !/^theme(?:0[1-9]|1[0-4])$/.test(payload.themePack)) {
    throw new Error('Presentation theme runtime payload is invalid.')
  }
  const actualChecksum = await sha256(payload.script)
  if (actualChecksum !== payload.runtimeChecksum) throw new Error('Presentation theme runtime checksum validation failed.')

  const before = new Set(Array.from(document.head.querySelectorAll('style')))
  const blobUrl = URL.createObjectURL(new Blob([payload.script], { type: 'text/javascript' }))
  try {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = blobUrl
      script.dataset.presentationRuntime = payload.themePack
      script.onload = () => { script.remove(); resolve() }
      script.onerror = () => { script.remove(); reject(new Error(`Unable to load native presentation runtime ${payload.themePack}.`)) }
      document.head.appendChild(script)
    })
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
  if (!(window as RuntimeWindow).__renderRuntimeSlide) throw new Error('Presentation runtime did not register its renderer.')
  const styleBaseline: ReadonlySet<HTMLStyleElement> = before
  const runtime = { checksum: payload.runtimeChecksum, themePack: payload.themePack, styleText: '', styleBaseline }
  return { ...runtime, styleText: collectNativeRuntimeStyleText(runtime) }
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
