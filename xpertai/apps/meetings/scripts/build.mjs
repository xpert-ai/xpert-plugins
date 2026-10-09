import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const output = resolve(root, "dist/remote-components/meetings");
await mkdir(output, { recursive: true });
await writeFile(
  resolve(root, "dist/meetings-assistant.yaml"),
  await readFile(resolve(root, "src/meetings-assistant.yaml"))
);
const previous = process.argv.includes("--check")
  ? await Promise.all(
      ["app.js", "app.css"].map((file) =>
        readFile(resolve(output, file), "utf8")
      )
    )
  : null;
const result = await build({
  entryPoints: [resolve(root, "remote-components/meetings/src/main.tsx")],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  jsx: "automatic",
  alias: {
    "@xpert-ai/plugin-shadcn-ui": resolve(
      root,
      "../../../packages/shadcn-ui/src/index.ts"
    ),
    react: require.resolve("react"),
    "react-dom/client": require.resolve("react-dom/client"),
    "react-dom": require.resolve("react-dom"),
    "react/jsx-runtime": require.resolve("react/jsx-runtime"),
  },
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "none",
});
await writeFile(resolve(output, "app.js"), result.outputFiles[0].text);
execFileSync(
  process.execPath,
  [
    resolve(
      dirname(require.resolve("@tailwindcss/cli/package.json")),
      "dist/index.mjs"
    ),
    "-i",
    resolve(root, "remote-components/meetings/src/styles.css"),
    "-o",
    resolve(output, "app.css"),
    "--minify",
  ],
  { cwd: root, stdio: "inherit" }
);
if (previous) {
  const next = await Promise.all(
    ["app.js", "app.css"].map((file) => readFile(resolve(output, file), "utf8"))
  );
  if (next.some((value, index) => value !== previous[index]))
    throw new Error(
      "Generated remote assets were stale. Review the build output."
    );
}
