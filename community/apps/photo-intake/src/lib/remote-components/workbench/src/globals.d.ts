import type * as ReactNamespace from 'react'
import type * as ReactDOMNamespace from 'react-dom'
import type * as ReactDOMClientNamespace from 'react-dom/client'

declare global {
  interface Window {
    React: typeof ReactNamespace
    ReactDOM: typeof ReactDOMNamespace & typeof ReactDOMClientNamespace
  }
}
