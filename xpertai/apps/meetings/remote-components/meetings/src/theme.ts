import { installShadcnThemeVars } from "@xpert-ai/plugin-shadcn-ui";
import type { Host } from "./bridge";

const properties = new Set<string>();
/** Preserve host semantic sizes independently of the root density scale. */
export function applyTheme(host: Host) {
  const root = document.documentElement;
  root.lang = host.locale?.replace("_", "-") ?? "zh-Hans";
  root.dataset.theme = host.theme?.mode ?? "light";
  for (const name of properties) root.style.removeProperty(name);
  properties.clear();
  for (const [key, value] of Object.entries({
    ...host.theme?.tokens,
    ...host.theme?.cssVars,
  })) {
    const name = key.startsWith("--xui-")
      ? key
      : key === "radius"
      ? "--xui-radius-md"
      : `--xui-${key.replace(
          /[A-Z]/g,
          (letter) => `-${letter.toLowerCase()}`
        )}`;
    if (!/^--xui-[a-z0-9-]+$/.test(name)) continue;
    root.style.setProperty(name, value);
    properties.add(name);
  }
  installShadcnThemeVars();
}
