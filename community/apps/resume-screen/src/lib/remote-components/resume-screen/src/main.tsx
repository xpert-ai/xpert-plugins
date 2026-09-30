/**
 * 远端组件入口（蓝图 §0.2/§5.2：主题通道 + rs- 样式注入 + bridge 生命周期）
 *
 * 启动时序按 spec §8.2：挂载 bridge 监听 → post('ready') → 等宿主 init{instanceId} →
 * 交出 HostContext 渲染正式工作台；boot 前呈现居中「加载中…」弱色文案（§6.1）。
 * 尺寸上报沿用 crm 模式：ResizeObserver(root) + 每次渲染后 reportResize()，
 * iframe 自身无全局滚动，容器高度随宿主伸缩。
 */
import '@xpert-ai/plugin-shadcn-ui/style.css'
import React from './react-shim'
import { createRoot } from './react-dom-client-shim'
import { installBridgeListener, post, reportResize } from './bridge'
import { injectStyles } from './styles'
import type { HostContext } from './types'
import { ResumeScreenWorkbench } from './components/workbench'

const { useEffect, useState } = React

// shadcn style.css 之外补注入 rs- 前缀定制样式（同 crm injectStyles 通道）
injectStyles()

function App() {
  const [context, setContext] = useState<HostContext | null>(null)

  useEffect(() => {
    const disposeBridge = installBridgeListener({
      onInit: setContext,
      // 宿主对话旁路事件（assistant.tool.completed 转发）：交给工作台做静默刷新
      onHostEvent: () => window.__resumeScreenReload?.()
    })
    post('ready')
    return disposeBridge
  }, [])

  // 容器尺寸变化 → 上报宿主（iframe 高度随内容自适应）
  useEffect(() => {
    const root = document.getElementById('root')
    if (!root || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => setTimeout(reportResize, 0))
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setTimeout(reportResize, 0)
  })

  if (!context) {
    return (
      <main className="rs-shell rs-shell-loading">
        <div className="rs-boot-loading">加载中…</div>
      </main>
    )
  }

  return <ResumeScreenWorkbench context={context} />
}

const rootElement = document.getElementById('root') ?? document.body
createRoot(rootElement).render(<App />)
