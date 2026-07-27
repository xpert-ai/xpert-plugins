import type * as ReactDOMNamespace from 'react-dom'
import type * as ReactDOMClientNamespace from 'react-dom/client'

type ReactDOMGlobalType =
  typeof ReactDOMNamespace & typeof ReactDOMClientNamespace

function readWindowGlobal<T>(key: 'ReactDOM'): T {
  return window[key as keyof Window] as T
}

const ReactDOMGlobal =
  readWindowGlobal<ReactDOMGlobalType>('ReactDOM')

export default ReactDOMGlobal
export const createPortal = ReactDOMGlobal.createPortal
export const flushSync = ReactDOMGlobal.flushSync
export const version = ReactDOMGlobal.version
