import type * as ReactModule from 'react'
import type * as ReactDomModule from 'react-dom'

declare global {
  interface Window {
    React: typeof ReactModule
    ReactDOM: typeof ReactDomModule & {
      createRoot?: (container: Element | DocumentFragment | null) => { render(node: ReactModule.ReactNode): void }
    }
  }
}

export {}
