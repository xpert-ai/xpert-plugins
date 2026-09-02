import type * as ReactNamespace from 'react'

const ReactGlobal = window.React
export const Fragment = ReactGlobal.Fragment
export function jsx(type: unknown, props: Record<string, unknown>, key?: string) {
  return ReactGlobal.createElement(type as ReactNamespace.ElementType, key === undefined ? props : { ...props, key })
}
export const jsxs = jsx
export const jsxDEV = jsx
