import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import plugin from "../dist/index.js";
import { APP_COVER } from "../dist/app-config.js";
const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
export const manifest = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  author: plugin.meta.author,
  license: pkg.license,
  level: plugin.meta.level,
  artifactNamespace: plugin.meta.artifactNamespace,
  assets: { screenshots: [APP_COVER] },
  targetApps: plugin.meta.targetApps,
  targetAppMeta: plugin.meta.targetAppMeta,
};
if (process.argv.includes("--write")) {
  mkdirSync(new URL("../.xpertai-plugin/", import.meta.url), {
    recursive: true,
  });
  writeFileSync(
    new URL("../.xpertai-plugin/plugin.json", import.meta.url),
    JSON.stringify(manifest, null, 2) + "\n",
  );
}
