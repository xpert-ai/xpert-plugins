import { HostBridge } from './bridge.js'
import { mountBoard } from './board.js'

declare global {
  interface Window { __ticketTriage?: unknown }
}

async function start() {
  const loading = document.querySelector<HTMLElement>('#ticket-triage-loading')!
  const bridge = new HostBridge()
  try {
    const { locale } = await bridge.connect()
    const board = mountBoard(bridge, locale)
    await board.start()
    loading.remove()
    window.__ticketTriage = { bridge, board }
  } catch (error) {
    const code = error instanceof Error ? error.message : 'unknown'
    loading.replaceChildren()
    const message = document.createElement('p')
    message.textContent = code === 'host_timeout'
      ? '工作台没有响应，请刷新视图重试。/ The workspace did not answer. Reload the view.'
      : '工单分诊板加载失败。/ The ticket board failed to load.'
    const retry = document.createElement('button')
    retry.textContent = '重新加载 / Reload'
    retry.addEventListener('click', () => window.location.reload())
    loading.append(message, retry)
  }
}

void start()
