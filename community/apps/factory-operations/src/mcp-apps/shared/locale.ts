import type { McpAppHostContext } from "./bridge.js";

export type FactoryAppLocale = "en" | "zh";

export interface FactoryAppLocaleState {
  locale: FactoryAppLocale;
  tag: string;
  direction: "ltr" | "rtl";
}

export function resolveLocale(
  context?: McpAppHostContext
): FactoryAppLocaleState {
  const fallback = navigator.language || "en-US";
  const tag = (context?.locale || context?.language || fallback)
    .trim()
    .replace("_", "-");
  const direction = context?.direction === "rtl" ? "rtl" : "ltr";
  document.documentElement.lang = tag;
  document.documentElement.dir = direction;
  return {
    locale: tag.toLowerCase().startsWith("zh") ? "zh" : "en",
    tag,
    direction,
  };
}
