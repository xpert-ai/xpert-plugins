import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(packageRoot, "src/mcp-apps");
const outputRoot = resolve(packageRoot, "dist/mcp-apps");
const apps = ["dashboard", "case-summary"];

const [html, css] = await Promise.all([
  readFile(resolve(sourceRoot, "index.html"), "utf8"),
  readFile(resolve(sourceRoot, "styles.css"), "utf8"),
]);

await Promise.all(
  apps.map(async (app) => {
    const result = await build({
      entryPoints: [resolve(sourceRoot, app, "main.ts")],
      bundle: true,
      write: false,
      format: "iife",
      platform: "browser",
      target: ["es2022"],
      sourcemap: false,
      minify: true,
      legalComments: "none",
    });
    const script = result.outputFiles[0]?.text;
    if (!script)
      throw new Error(`MCP App '${app}' did not produce a browser bundle.`);
    const outputDirectory = resolve(outputRoot, app);
    const bundledHtml = html
      .replace(
        '<link rel="stylesheet" href="./styles.css">',
        `<style>\n${css}\n</style>`
      )
      .replace(
        '<script type="module" src="./main.ts"></script>',
        `<script>\n${script}\n</script>`
      );
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(resolve(outputDirectory, "index.html"), bundledHtml);
  })
);
