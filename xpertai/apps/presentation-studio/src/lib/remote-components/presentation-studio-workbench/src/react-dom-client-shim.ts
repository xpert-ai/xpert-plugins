import type * as ReactDOMClientNamespace from 'react-dom/client'
function readGlobal<T>(key: string): T { return Reflect.get(window, key) as T }
const ReactDOMGlobal = readGlobal<typeof ReactDOMClientNamespace>('ReactDOM')
export const createRoot = ReactDOMGlobal.createRoot
export const hydrateRoot = ReactDOMGlobal.hydrateRoot
