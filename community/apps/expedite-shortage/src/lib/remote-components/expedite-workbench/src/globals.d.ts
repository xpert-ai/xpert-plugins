// iframe 运行时由宿主注入 React / ReactDOM 的 UMD 全局对象，这里声明它们的类型
import type * as ReactNamespace from 'react'
import type * as ReactDOMNamespace from 'react-dom'

declare global {
  interface Window {
    React: typeof ReactNamespace
    ReactDOM: typeof ReactDOMNamespace
  }
}

export {}
