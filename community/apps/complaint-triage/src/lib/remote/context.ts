import { createContext, useContext } from 'react'
import type { TriageApi } from './api.js'
import type { HostEvent } from './bridge.js'
import type { Translate } from './i18n.js'

export interface AppServices {
  api: TriageApi
  t: Translate
  formatTime: (iso: string | null) => string
  subscribeHostEvents: (listener: (event: HostEvent) => void) => () => void
}

export const ServicesContext = createContext<AppServices | null>(null)

export function useServices(): AppServices {
  const services = useContext(ServicesContext)
  if (!services) throw new Error('ServicesContext is missing')
  return services
}
