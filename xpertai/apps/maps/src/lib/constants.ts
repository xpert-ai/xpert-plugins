export const MAPS_NAMESPACE = 'maps' as const
export const MAPS_MIDDLEWARE = `${MAPS_NAMESPACE}:explorer`
export const MAPS_APP = `${MAPS_NAMESPACE}_explorer`
export const MAPS_VIEW_PROVIDER = `${MAPS_NAMESPACE}:workbench`
export const MAPS_VIEW_KEY = `${MAPS_NAMESPACE}-explorer`
export const MAPS_REMOTE_ENTRY = 'maps-workbench'
export const MAPS_LEVEL = 'organization' as const
export const MAPS_ICON = {
  type: 'svg' as const,
  value: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15m6-12v15"/><circle cx="15" cy="9" r="2"/></svg>'
}
