import type * as ReactDOMClientNamespace from 'react-dom/client'
function readWindowGlobal<T>(key: 'ReactDOM'): T {
  return window[key as keyof Window] as T
}
const ReactDOMGlobal = readWindowGlobal<typeof ReactDOMClientNamespace>('ReactDOM')
export const createRoot = ReactDOMGlobal.createRoot
export const hydrateRoot = ReactDOMGlobal.hydrateRoot
