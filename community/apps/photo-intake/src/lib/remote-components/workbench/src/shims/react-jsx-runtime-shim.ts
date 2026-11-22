import type { ElementType } from 'react'

const ReactGlobal = window.React

export const Fragment = ReactGlobal.Fragment

export function jsx(type: ElementType, props: Record<string, unknown>, key?: string) {
  return ReactGlobal.createElement(type, key === undefined ? props : { ...props, key })
}

export const jsxs = jsx
export const jsxDEV = jsx
