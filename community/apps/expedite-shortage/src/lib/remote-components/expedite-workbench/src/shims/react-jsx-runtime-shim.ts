// esbuild 的 jsx: 'automatic' 会生成对 react/jsx-runtime 的调用，这里转成 window.React.createElement
import type * as ReactNamespace from 'react'

const ReactGlobal = window.React
export const Fragment = ReactGlobal.Fragment
export function jsx(type: ReactNamespace.ElementType, props: Record<string, unknown>, key?: string) {
  return ReactGlobal.createElement(type, key === undefined ? props : { ...props, key })
}
export const jsxs = jsx
export const jsxDEV = jsx
