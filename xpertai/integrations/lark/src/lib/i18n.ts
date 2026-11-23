import { createI18nInstance, RequestContext } from '@xpert-ai/plugin-sdk';
import { i18n as I18nInstance, TOptions } from 'i18next';

let i18nObject: I18nInstance = null;
export function translate(key: string, options?: TOptions) {
  options = options || {};
  options.lng = options.lng || RequestContext.getLanguageCode();
  return i18nObject?.t(key, options) || (typeof options.defaultValue === 'string' ? options.defaultValue : key);
}

export async function initI18n(pluginDir: string): Promise<void> {
  i18nObject = await createI18nInstance(pluginDir);
}
