import { t, i18n, type MessageKey } from './i18n'
import { ResourceImage, referenceFileKey } from '../src/references'
import { previewFile } from './bridge'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Button } from '@xpert-ai/plugin-shadcn-ui'

/** Access grants live only in DOM memory, never in the collaboration document. */
export const resourceImageView = (resourceId: string) => ResourceImage.extend({
  addNodeView() { return ({ node }) => {
    // The NodeView needs DOM mount points; its interactive control still uses the shared UI primitive.
    const dom = document.createElement('span'), image = document.createElement('img'), status = document.createElement('span')
    const statusRoot = createRoot(status)
    dom.className = 'resource-image'; dom.contentEditable = 'false'; dom.dataset.resourceImage = node.attrs.src
    image.alt = node.attrs.alt; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; image.hidden = true
    let statusKey: MessageKey = 'image.loading', statusDisabled = true
    const renderStatus = (key: MessageKey, disabled = false) => {
      statusKey = key; statusDisabled = disabled
      statusRoot.render(createElement(Button, { type: 'button', variant: 'outline', disabled, onClick: () => void load() }, t(key)))
    }
    const unsubscribe = i18n.subscribe(() => renderStatus(statusKey, statusDisabled))
    let disposed = false, pending = false
    const load = async () => {
      if (pending || disposed) return
      pending = true; status.hidden = false; renderStatus('image.loading', true)
      try {
        const file = await previewFile(referenceFileKey(resourceId, node.attrs.src))
        if (!disposed) { image.src = file.url; image.hidden = false }
      } catch { if (!disposed) { image.removeAttribute('src'); image.hidden = true; renderStatus('image.unavailable') } }
      finally { pending = false }
    }
    image.onload = () => { status.hidden = true }
    image.onerror = () => { if (!disposed) { image.hidden = true; status.hidden = false; renderStatus('image.failed') } }
    dom.append(image, status); void load()
    // Periodically reauthorize visible previews; access loss removes the displayed resource.
    const timer = setInterval(() => { if (!document.hidden) void load() }, 60000)
    return { dom, stopEvent: (event) => event.target instanceof Node && status.contains(event.target), destroy() {
      disposed = true; unsubscribe(); clearInterval(timer); image.onload = image.onerror = null; image.removeAttribute('src')
      queueMicrotask(() => statusRoot.unmount())
    } }
  } }
})
