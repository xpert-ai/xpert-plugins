import { exportToBlob, exportToSvg, restore, convertToExcalidrawElements } from '@excalidraw/excalidraw'
import { parseMermaidToExcalidraw } from '@excalidraw/mermaid-to-excalidraw'

window.renderDrawing = async (input, scene) => {
  if (input.kind === 'mermaid') {
    const parsed = await parseMermaidToExcalidraw(scene.mermaidSource, { themeVariables: { fontFamily: 'Virgil' } })
    const elements = convertToExcalidrawElements(parsed.elements)
    if (elements.length > 5000) throw new Error('conversion_too_large')
    return JSON.stringify({ elements, appState: scene.appState ?? {}, files: parsed.files ?? {} })
  }
  const restored = restore(scene, null, null)
  const elements = restored.elements.filter(element => !element.isDeleted)
  // Bound total raster area regardless of caller-controlled coordinates.
  const options = { elements, files: restored.files, appState: { ...restored.appState, exportBackground: true, exportEmbedScene: false }, maxWidthOrHeight: 2400 }
  if (input.format === 'svg') return (await exportToSvg(options)).outerHTML
  const blob = await exportToBlob({ ...options, mimeType: 'image/png' })
  return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(blob) })
}
