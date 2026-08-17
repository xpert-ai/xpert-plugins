import type * as ReactDOMClientNamespace from 'react-dom/client'

function readReactDomClient(): typeof ReactDOMClientNamespace {
  const value: unknown = Reflect.get(window as object, 'ReactDOM')
  return value as typeof ReactDOMClientNamespace
}

const ReactDOMGlobal = readReactDomClient()
export const createRoot = ReactDOMGlobal.createRoot
export const hydrateRoot = ReactDOMGlobal.hydrateRoot
