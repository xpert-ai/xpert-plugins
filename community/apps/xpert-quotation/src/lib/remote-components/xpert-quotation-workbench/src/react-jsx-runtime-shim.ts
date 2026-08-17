import type * as ReactNamespace from 'react'

const ReactGlobal = Reflect.get(window, 'React') as typeof ReactNamespace
export const Fragment = ReactGlobal.Fragment
export function jsx(type: ReactNamespace.ElementType, props: Record<string, unknown> | null, key?: ReactNamespace.Key) {
  return ReactGlobal.createElement(type, key === undefined ? props : { ...props, key })
}
export const jsxs = jsx
export const jsxDEV = jsx
