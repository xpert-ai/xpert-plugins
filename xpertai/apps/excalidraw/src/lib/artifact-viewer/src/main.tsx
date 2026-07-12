import '@excalidraw/excalidraw/index.css'
import './styles.css'

import { Excalidraw, restore, type ExcalidrawImperativeAPI } from '@excalidraw/excalidraw'
import * as React from 'react'
import { createRoot } from 'react-dom/client'

type ArtifactViewerScene = {
  elements: Record<string, unknown>[]
  appState: Record<string, unknown>
  files: Record<string, unknown>
}

type ArtifactViewerPayload = {
  viewerVersion: number
  title: string
  description?: string | null
  revision: number
  versionNumber: number
  theme: 'light' | 'dark'
  scene: ArtifactViewerScene
}

declare global {
  interface Window {
    __XPERT_EXCALIDRAW_ARTIFACT__?: ArtifactViewerPayload
  }
}

class ViewerErrorBoundary extends React.Component<React.PropsWithChildren, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return <ViewerMessage title="Drawing unavailable" detail="The published Excalidraw scene could not be displayed." />
    }
    return this.props.children
  }
}

function ViewerMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="artifact-message" role="status">
      <div className="artifact-message-card">
        <div className="artifact-mark" aria-hidden="true">✦</div>
        <h1>{title}</h1>
        <p>{detail}</p>
      </div>
    </main>
  )
}

function ArtifactViewer({ payload }: { payload: ArtifactViewerPayload }) {
  const apiRef = React.useRef<ExcalidrawImperativeAPI | null>(null)
  const scene = React.useMemo(() => restoreScene(payload), [payload])
  const activeElements = scene.elements.filter((element) => !isDeletedElement(element))

  const fitToContent = React.useCallback(() => {
    const api = apiRef.current
    if (!api) return
    const elements = api.getSceneElements().filter((element) => !element.isDeleted)
    if (!elements.length) return
    api.scrollToContent(elements, { fitToContent: true, animate: false })
  }, [])

  if (!activeElements.length) {
    return <ViewerMessage title={payload.title || 'Untitled drawing'} detail="This published drawing is empty." />
  }

  return (
    <div className={`artifact-shell theme-${payload.theme}`}>
      <header className="artifact-header">
        <div className="artifact-title-block">
          <span className="artifact-logo" aria-hidden="true">✦</span>
          <div>
            <h1>{payload.title || 'Untitled drawing'}</h1>
            <p>Published Excalidraw · v{payload.versionNumber} · r{payload.revision}</p>
          </div>
        </div>
        <button type="button" onClick={fitToContent}>Fit drawing</button>
      </header>
      <main className="artifact-canvas" aria-label={payload.title || 'Published Excalidraw drawing'}>
        <Excalidraw
          initialData={scene as never}
          theme={payload.theme}
          name={payload.title}
          viewModeEnabled
          autoFocus={false}
          handleKeyboardGlobally={false}
          validateEmbeddable={false}
          aiEnabled={false}
          UIOptions={{
            canvasActions: {
              changeViewBackgroundColor: false,
              clearCanvas: false,
              export: false,
              loadScene: false,
              saveToActiveFile: false,
              toggleTheme: false,
              saveAsImage: false
            },
            tools: { image: false }
          }}
          excalidrawAPI={(api) => {
            apiRef.current = api
            window.requestAnimationFrame(fitToContent)
          }}
          onLinkOpen={(element, event) => {
            event.preventDefault()
            const link = typeof element.link === 'string' ? element.link : ''
            if (isSafeHttpUrl(link)) window.open(link, '_blank', 'noopener,noreferrer')
          }}
        />
      </main>
    </div>
  )
}

function restoreScene(payload: ArtifactViewerPayload) {
  if (!payload || payload.viewerVersion !== 1 || !payload.scene || !Array.isArray(payload.scene.elements)) {
    throw new Error('Invalid Excalidraw Artifact payload.')
  }
  return restore(
    {
      elements: payload.scene.elements as never,
      appState: payload.scene.appState as never,
      files: payload.scene.files as never
    },
    payload.scene.appState as never,
    null,
    { repairBindings: true }
  )
}

function isDeletedElement(value: unknown) {
  return Boolean(value && typeof value === 'object' && Reflect.get(value, 'isDeleted') === true)
}

function isSafeHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Missing Excalidraw Artifact root element.')

const root = createRoot(rootElement)
const payload = window.__XPERT_EXCALIDRAW_ARTIFACT__
root.render(
  <ViewerErrorBoundary>
    {payload
      ? <ArtifactViewer payload={payload} />
      : <ViewerMessage title="Drawing unavailable" detail="The published Excalidraw payload is missing." />}
  </ViewerErrorBoundary>
)
