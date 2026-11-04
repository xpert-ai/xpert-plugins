// 构建自包含 iframe，使用当前工作区的共享组件；校验时在内存重建并逐字比较。
import { build } from "esbuild";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const result = await build({
  absWorkingDir: fileURLToPath(root),
  entryPoints: ["src/remote/main.tsx"],
  outfile: "dist/remote/app.js",
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  minify: true,
  legalComments: "none",
  define: { "process.env.NODE_ENV": '"production"' },
});
const js = result.outputFiles.find((f) => f.path.endsWith(".js")).text;
const css = result.outputFiles.find((f) => f.path.endsWith(".css")).text;
const template = await readFile(new URL("src/remote/index.html", root), "utf8");
const html = template
  .replace("<!-- STYLES -->", () => `<style>${css}</style>`)
  .replace(
    "<!-- SCRIPT -->",
    () => `<script>${js.replaceAll("</script", "<\\/script")}</script>`,
  );
const out = new URL("dist/remote/index.html", root),
  yaml = new URL("src/competitor-monitor-assistant.yaml", root),
  yamlOut = new URL("dist/competitor-monitor-assistant.yaml", root);
if (process.argv.includes("--check")) {
  if (
    (await readFile(new URL("dist/remote/app.js", root), "utf8")) !== js ||
    (await readFile(new URL("dist/remote/app.css", root), "utf8")) !== css
  )
    throw Error("Remote assets are stale");
  if ((await readFile(out, "utf8")) !== html)
    throw Error("Remote output is stale");
  if ((await readFile(yamlOut, "utf8")) !== (await readFile(yaml, "utf8")))
    throw Error("Template output is stale");
} else {
  await mkdir(new URL("dist/remote/", root), { recursive: true });
  await writeFile(out, html);
  await writeFile(new URL("dist/remote/app.js", root), js);
  await writeFile(new URL("dist/remote/app.css", root), css);
  await copyFile(yaml, yamlOut);
}
