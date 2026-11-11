import React from 'react'
import { createRoot } from 'react-dom/client'
import { installBridgeListener, post } from './bridge'
import { Workbench } from './workbench'

installBridgeListener({
  onInit: () => {
    // 宿主初始化完成，可读取 context.manifest / locale / theme
  },
  onHostEvent: () => {
    // 宿主事件（如 assistant.tool.completed），需要时可触发刷新
  }
})

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <Workbench />
    </React.StrictMode>
  )
}

post('ready')
