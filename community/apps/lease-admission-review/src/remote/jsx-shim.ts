import React from './react-shim'
import type { ElementType, Attributes } from 'react'
export const Fragment = React.Fragment
export const jsx = (
  type: ElementType,
  props: Attributes | null,
  key?: string
) => React.createElement(type, key === undefined ? props : { ...props, key })
export const jsxs = jsx
export const jsxDEV = jsx
