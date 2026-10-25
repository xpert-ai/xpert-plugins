import type * as ReactDOMClientNamespace from 'react-dom/client'

const ReactDOMClientGlobal = window.ReactDOM as unknown as typeof ReactDOMClientNamespace
export const createRoot = ReactDOMClientGlobal.createRoot
export const hydrateRoot = ReactDOMClientGlobal.hydrateRoot
