import * as React from 'react'
import { createRoot } from 'react-dom/client'
import '@xpert-ai/plugin-shadcn-ui/style.css'
import './styles.css'
import { App } from './app.js'

document.documentElement.lang = 'zh-CN'
const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('工作台根节点不存在')
}
createRoot(rootElement).render(
  <App />
)
