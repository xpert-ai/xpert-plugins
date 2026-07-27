import type * as ReactNamespace from 'react'
import type * as ReactDomClientNamespace from 'react-dom/client'

function readWindowGlobal<T>(key: 'React' | 'ReactDOM'): T | undefined {
  return window[key as keyof Window] as T | undefined
}

export function requireReactGlobal(): typeof ReactNamespace {
  const value = readWindowGlobal<typeof ReactNamespace>('React')
  if (!value) throw new Error('Host React runtime is unavailable.')
  return value
}

export function requireReactDomClientGlobal(): typeof ReactDomClientNamespace {
  const value = readWindowGlobal<typeof ReactDomClientNamespace>('ReactDOM')
  if (!value) throw new Error('Host ReactDOM runtime is unavailable.')
  return value
}
