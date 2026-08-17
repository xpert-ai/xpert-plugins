import type * as ReactDOMNamespace from 'react-dom'

const ReactDOMGlobal = Reflect.get(window, 'ReactDOM') as typeof ReactDOMNamespace
export default ReactDOMGlobal
export const createPortal = ReactDOMGlobal.createPortal
export const flushSync = ReactDOMGlobal.flushSync
export const render = ReactDOMGlobal.render
export const unmountComponentAtNode = ReactDOMGlobal.unmountComponentAtNode
export const version = ReactDOMGlobal.version
