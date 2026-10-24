import { createInstance } from 'i18next'
import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react'

export type ViewLocale = 'en' | 'zh-Hans'
export type MessageValues = Record<string, string | number>
export type MessageCatalog = Record<string, string>
const localizedMessage = Symbol('remote-view.message')
export type ViewMessage = { [localizedMessage]: true; key: string; values?: MessageValues }
export type ViewMessageValue = string | Error | ViewMessage

export class ViewMessageError extends Error {
  constructor(readonly key: string, readonly values: MessageValues | undefined, translate: (key: string, values?: MessageValues) => string) {
    super()
    // Keep a stable machine-readable key and resolve text when displayed, including after locale changes.
    Object.defineProperty(this, 'message', { configurable: true, get: () => translate(key, values) })
    this.name = 'ViewMessageError'
  }
}
export const uiMessages = {
  en: { close: 'Close', commandTitle: 'Command palette', commandDescription: 'Search for a command to run…' },
  'zh-Hans': { close: '关闭', commandTitle: '命令面板', commandDescription: '搜索要运行的命令…' }
}

/** Normalize the host's BCP-47/legacy locale, with English as the unsupported-locale fallback. */
export function normalizeViewLocale(value?: string): ViewLocale {
  try { return new Intl.Locale((value || 'en').replaceAll('_', '-')).language === 'zh' ? 'zh-Hans' : 'en' }
  catch { return 'en' }
}

/** One instance per iframe/view. Never change a process-wide i18next singleton.
 * Catalogs are bundled (no translation network request). Keys, plural rules and
 * interpolation belong to i18next; dates/numbers use the same locale via Intl.
 */
export function createRemoteI18n<Catalog extends MessageCatalog>(catalogs: {
  en: Catalog; 'zh-Hans': Record<keyof Catalog, string>
}, initialLocale = typeof navigator === 'undefined' ? 'en' : navigator.language) {
  const instance = createInstance()
  void instance.init({
    lng: normalizeViewLocale(initialLocale), fallbackLng: 'en', supportedLngs: ['en', 'zh-Hans'],
    load: 'currentOnly', initAsync: false, keySeparator: false, defaultNS: 'view',
    interpolation: { escapeValue: false }, // React escapes text; never use translations as untrusted HTML.
    resources: {
      en: { view: catalogs.en, ui: uiMessages.en },
      'zh-Hans': { view: catalogs['zh-Hans'], ui: uiMessages['zh-Hans'] }
    }
  })
  const getLocale = () => normalizeViewLocale(instance.resolvedLanguage ?? instance.language)
  const subscribe = (listener: () => void) => {
    instance.on('languageChanged', listener)
    return () => { instance.off('languageChanged', listener) }
  }
  const translate = (key: string, values?: MessageValues) => String(instance.t(key, values))
  return {
    getLocale, subscribe,
    // Called only by the validated parent init handler. A locale update must not reload a document.
    setLocale(value?: string) {
      if (value !== undefined) void instance.changeLanguage(normalizeViewLocale(value))
      if (typeof document !== 'undefined') document.documentElement.lang = getLocale()
    },
    t: (key: Extract<keyof Catalog, string>, values?: MessageValues): string => translate(key, values),
    message: (key: Extract<keyof Catalog, string>, values?: MessageValues): ViewMessage => ({ [localizedMessage]: true, key, values }),
    error: (key: Extract<keyof Catalog, string>, values?: MessageValues) => new ViewMessageError(key, values, translate),
    format(value: ViewMessageValue): string {
      if (typeof value === 'string') return value
      if (value instanceof Error) return value.message
      return translate(value.key, value.values)
    },
    ui: (key: keyof typeof uiMessages.en): string => String(instance.t(key, { ns: 'ui' })),
    date(value: string | Date, options: Intl.DateTimeFormatOptions = {}) {
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(getLocale(), options).format(date)
    },
    number(value: number, options?: Intl.NumberFormatOptions) { return new Intl.NumberFormat(getLocale(), options).format(value) },
    /** Localized labels supplied by providers are data, not translation keys. */
    label(value: string | Record<string, string>, fallback = '') {
      if (typeof value === 'string') return value
      const entries = Object.entries(value)
      const language = getLocale()
      return entries.find(([key]) => normalizeViewLocale(key) === language && /^(en|zh)([-_]|$)/i.test(key))?.[1]
        ?? value.en_US ?? value.en ?? value['en-US'] ?? fallback
    }
  }
}

type LocaleStore = Pick<ReturnType<typeof createRemoteI18n>, 'getLocale' | 'subscribe' | 'ui'>
const fallback = createRemoteI18n({ en: {}, 'zh-Hans': {} }, 'en')
const LocaleContext = createContext<LocaleStore>(fallback)

export function RemoteI18nProvider({ i18n, children }: { i18n: LocaleStore; children: ReactNode }) {
  return <LocaleContext.Provider value={i18n}>{children}</LocaleContext.Provider>
}
export function useRemoteLocale(i18n: LocaleStore) {
  return useSyncExternalStore(i18n.subscribe, i18n.getLocale, i18n.getLocale)
}
/** Store message identity rather than rendered copy, so open alerts survive locale updates. */
export function useLocalizedMessage(i18n: LocaleStore & { format: (value: ViewMessageValue) => string }, initial: ViewMessageValue = '') {
  useRemoteLocale(i18n)
  const [value, setValue] = useState<ViewMessageValue>(initial)
  return [i18n.format(value), setValue] as const
}
/** Shared component accessibility text follows the view, without modifying shadcn appearance. */
export function useUiText() {
  const i18n = useContext(LocaleContext)
  useRemoteLocale(i18n)
  return i18n.ui
}
