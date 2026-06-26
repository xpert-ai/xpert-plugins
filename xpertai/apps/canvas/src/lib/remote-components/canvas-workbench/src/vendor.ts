import type * as ReactNamespace from 'react'
import type * as ReactDOMNamespace from 'react-dom'
import type * as ReactDOMClientNamespace from 'react-dom/client'

type ReactDOMGlobal = typeof ReactDOMNamespace & typeof ReactDOMClientNamespace

function readWindowGlobal<T>(key: 'React' | 'ReactDOM'): T {
  return window[key as keyof Window] as T
}

export const React = readWindowGlobal<typeof ReactNamespace>('React')
export const ReactDOM = readWindowGlobal<ReactDOMGlobal>('ReactDOM')
export const h: typeof ReactNamespace.createElement = React.createElement
