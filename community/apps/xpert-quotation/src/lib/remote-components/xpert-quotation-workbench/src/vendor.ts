import type * as ReactNamespace from 'react'
import type * as ReactDOMClientNamespace from 'react-dom/client'

function readWindowGlobal<T>(key: 'React' | 'ReactDOM'): T {
  return Reflect.get(window, key) as T
}

export const React = readWindowGlobal<typeof ReactNamespace>('React')
export const ReactDOM = readWindowGlobal<typeof ReactDOMClientNamespace>('ReactDOM')
export const h = React.createElement
