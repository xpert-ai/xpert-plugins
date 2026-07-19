import React from './react-shim'
export const Fragment = React.Fragment

type RuntimeProps = object | null | undefined
const createElementCompat = React.createElement as (
  type: React.ElementType,
  props: RuntimeProps
) => React.ReactElement

export function jsx(type: React.ElementType, props: RuntimeProps, key?: React.Key) {
  return createElementCompat(type, key === undefined ? props : { ...props, key })
}

export const jsxs = jsx
export const jsxDEV = jsx
