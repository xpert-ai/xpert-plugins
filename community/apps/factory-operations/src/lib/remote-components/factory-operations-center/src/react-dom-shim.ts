import type * as ReactDOMNamespace from 'react-dom'

const ReactDOMGlobal = window.ReactDOM as typeof ReactDOMNamespace
export default ReactDOMGlobal
export const createPortal = ReactDOMGlobal.createPortal
export const flushSync = ReactDOMGlobal.flushSync
export const render = Reflect.get(ReactDOMGlobal, 'render') as typeof ReactDOMGlobal.render

