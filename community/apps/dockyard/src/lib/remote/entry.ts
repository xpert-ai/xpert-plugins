import { adapter } from './adapter.js'
import type { Sample } from './adapter.js'
import { mountSelectionReferenceMenu } from './selection-reference-menu.js'
import { t } from './i18n.js'

declare global { interface Window { demo: Sample } }
async function start() {
  const loading = document.querySelector<HTMLElement>('#dockyard-loading')!
  try {
    await adapter.connect()
    await import('dockyard-sample')
    for (const id of ['dockyard.ai-layout', 'dockyard.content']) {
      const model = window.demo.manager.Find(id)
      if (model) { model.CanClose = true; window.demo.manager.Close(model) }
    }
    adapter.attach(window.demo)
    mountSelectionReferenceMenu(window.demo)
    loading.remove()
  } catch {
    loading.replaceChildren()
    const message = document.createElement('p'); message.textContent = t('loadFailed')
    const retry = document.createElement('button'); retry.textContent = t('reload'); retry.addEventListener('click', () => window.location.reload())
    loading.append(message, retry)
  }
}
void start()
