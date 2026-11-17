import { createRemoteI18n } from "@xpert-ai/plugin-shadcn-ui/i18n";
import en from "./locales/en-US.json";
import zh from "./locales/zh-Hans.json";
export const i18n = createRemoteI18n({ en, "zh-Hans": zh }, "en-US");
export type MessageKey = keyof typeof en;
type ParametersByKey = {
  summary: { count: number };
  "field.select": { id: string };
  "delete.count": { label: string; count: number };
};
// 插值参数跟随文案键约束；缺少 count 或写错参数会在类型检查时失败。
export function t<K extends MessageKey>(
  key: K,
  ...args: K extends keyof ParametersByKey
    ? [values: ParametersByKey[K]]
    : [values?: never]
) {
  return i18n.t(key, args[0]);
}
export function formatTime(value: string) {
  return (
    i18n.date(value, {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }) || t("time.invalid")
  );
}
export function errorText(error: Error) {
  const key = `error.${error.message}`;
  return key in en ? t(key as MessageKey) : error.message || t("error.generic");
}
