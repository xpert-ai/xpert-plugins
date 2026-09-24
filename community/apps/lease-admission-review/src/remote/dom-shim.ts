import type * as ReactDOMClient from 'react-dom/client'
import type * as ReactDOM from 'react-dom'
declare global {
  interface Window {
    ReactDOM: typeof ReactDOM & typeof ReactDOMClient
  }
}
export const createRoot = window.ReactDOM.createRoot
export const createPortal = window.ReactDOM.createPortal
export const flushSync = window.ReactDOM.flushSync
export default window.ReactDOM
