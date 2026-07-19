import type * as ReactDOMNamespace from 'react-dom'
import type * as ReactDOMClientNamespace from 'react-dom/client'

type ReactDOMGlobal = typeof ReactDOMNamespace & typeof ReactDOMClientNamespace

function readWindowGlobal<T>(key: 'ReactDOM'): T {
  return window[key as keyof Window] as T
}

const ReactDOMGlobal = readWindowGlobal<ReactDOMGlobal>('ReactDOM')
export default ReactDOMGlobal
export const createPortal = ReactDOMGlobal.createPortal
export const flushSync = ReactDOMGlobal.flushSync
export const findDOMNode = ReactDOMGlobal.findDOMNode
export const hydrate = ReactDOMGlobal.hydrate
export const render = ReactDOMGlobal.render
export const unstable_batchedUpdates = ReactDOMGlobal.unstable_batchedUpdates
export const unmountComponentAtNode = ReactDOMGlobal.unmountComponentAtNode
export const version = ReactDOMGlobal.version
