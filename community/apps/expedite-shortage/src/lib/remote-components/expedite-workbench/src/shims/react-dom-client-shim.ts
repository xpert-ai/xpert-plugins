// 把 `react-dom/client` 指向宿主注入的 window.ReactDOM（React 18 UMD 包含 createRoot）
import type * as ReactDOMClientNamespace from 'react-dom/client'

const ReactDOMClientGlobal: Pick<typeof ReactDOMClientNamespace, 'createRoot' | 'hydrateRoot'> = {
  createRoot: Reflect.get(window.ReactDOM, 'createRoot') as typeof ReactDOMClientNamespace.createRoot,
  hydrateRoot: Reflect.get(window.ReactDOM, 'hydrateRoot') as typeof ReactDOMClientNamespace.hydrateRoot
}
export const createRoot = ReactDOMClientGlobal.createRoot
export const hydrateRoot = ReactDOMClientGlobal.hydrateRoot
