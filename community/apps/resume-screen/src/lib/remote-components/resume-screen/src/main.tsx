/**
 * 远端组件入口（骨架占位版）
 *
 * 仅验证「esbuild IIFE + shadcn style.css → app.css + copy-assets + provider appCss」
 * 全链路可通；正式工作台在 Task 20 依蓝图（resume-screen-ui-design.md v4.0）替换。
 */
import '@xpert-ai/plugin-shadcn-ui/style.css'
import React from './react-shim'
import { createRoot } from './react-dom-client-shim'

function App() {
  return React.createElement('div', { style: { padding: 24 } }, 'Resume Screening Workbench (bootstrap)')
}

const rootElement = document.getElementById('root')
const container = rootElement ?? document.body
createRoot(container).render(React.createElement(App))
