import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

// Private context and artifacts live outside the checkout. Never store passwords or tokens in reports.
export const config = JSON.parse(
  await readFile(resolve(process.argv[2]), "utf8"),
);
for (const key of [
  "platformRoot",
  "outputDir",
  "apiUrl",
  "webUrl",
  "orgId",
  "orgName",
  "assistantId",
  "assistantSlug",
  "cases",
]) {
  if (!config[key]) throw new Error(`Missing acceptance context: ${key}`);
}
if (
  !Array.isArray(config.cases) ||
  !config.cases.length ||
  new Set(config.cases.map((item) => item.format)).size !== config.cases.length
)
  throw new Error("Configure distinct nonempty format cases");
for (const item of config.cases)
  if (
    !["csv", "json", "xlsx"].includes(item.format) ||
    !item.sourceName ||
    !item.filePath ||
    !item.dataSourceId
  ) {
    throw new Error(
      "Each case requires format, sourceName, dataSourceId and filePath",
    );
  }
export const root = resolve(config.outputDir);
await mkdir(root, { recursive: true, mode: 0o700 });
export const load = async (path) =>
  JSON.parse(await readFile(join(root, path), "utf8"));
export const save = async (path, value) => {
  await mkdir(resolve(root, path, ".."), { recursive: true, mode: 0o700 });
  await writeFile(join(root, path), JSON.stringify(value, null, 2), {
    mode: 0o600,
  });
};
const cli = await import(
  pathToFileURL(join(config.platformRoot, "tools/scripts/local-plugin-cli.mjs"))
);
const auth = await cli.requireAuthentication(config);
export const headers = cli.createRequestHeaders(
  config,
  auth.token,
  auth.tenantId,
);
export async function request(path, method = "GET", body) {
  return fetch(config.apiUrl + "/api" + path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
export async function api(path, method = "GET", body) {
  const response = await request(path, method, body);
  const text = await response.text();
  const value = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
  return value;
}
export async function download(filePath) {
  const response = await request(
    `/ai/assistants/${config.assistantId}/workspace/file/download?path=${encodeURIComponent(filePath)}`,
  );
  if (!response.ok) throw new Error(`File download: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
export async function upload(filePath, bytes) {
  const parts = filePath.split("/"),
    name = parts.pop(),
    form = new FormData();
  form.append("path", parts.join("/"));
  form.append("file", new Blob([bytes]), name);
  const formHeaders = { ...headers };
  delete formHeaders["content-type"];
  delete formHeaders["Content-Type"];
  const response = await fetch(
    `${config.apiUrl}/api/ai/assistants/${config.assistantId}/workspace/file/upload`,
    {
      method: "POST",
      headers: formHeaders,
      body: form,
    },
  );
  await response.arrayBuffer();
  if (!response.ok) throw new Error(`File upload: HTTP ${response.status}`);
}
const secret = (envName, service) => {
  if (envName && process.env[envName]) return process.env[envName];
  if (service)
    return execFileSync(
      "security",
      ["find-generic-password", "-s", service, "-w"],
      { encoding: "utf8" },
    ).trim();
  throw new Error(
    "Configure Keychain services or usernameEnv/passwordEnv for UI login",
  );
};
export async function login() {
  const { chromium } = createRequire(join(config.platformRoot, "package.json"))(
    "playwright-core",
  );
  const b = await chromium.launch({
    headless: true,
    channel: config.browserChannel ?? "chrome",
  });
  try {
    const context = await b.newContext({
        viewport: { width: 1600, height: 1100 },
      }),
      p = await context.newPage();
    p.setDefaultTimeout(30000);
    await p.goto(`${config.webUrl}/chat/x/${config.assistantSlug}/c`);
    await p.waitForURL("**/auth/login**");
    await p
      .getByRole("textbox", { name: "账号", exact: true })
      .fill(secret(config.usernameEnv, config.usernameKeychainService));
    await p
      .getByRole("textbox", { name: "密码", exact: true })
      .fill(secret(config.passwordEnv, config.passwordKeychainService));
    await p.getByRole("button", { name: "登录", exact: true }).click();
    await p.waitForURL("**/chat/**");
    await p.waitForTimeout(1500);
    const org = p.getByRole("button", {
      name: `当前组织 ${config.orgName}`,
      exact: true,
    });
    if (!(await org.count())) {
      const expand = p.getByRole("button", {
        name: "Expand sidebar",
        exact: true,
      });
      if (await expand.count()) {
        await expand.focus();
        await p.keyboard.press("Enter");
      }
      const scope = p.getByRole("button", {
        name: config.tenantButton ?? "当前租户 租户",
        exact: true,
      });
      await scope.focus();
      await p.keyboard.press("Enter");
      await p
        .getByRole("menuitem", {
          name: `${config.orgName} ${config.orgName}`,
          exact: true,
        })
        .click();
      await org.waitFor();
    }
    await p
      .frameLocator('iframe[name="chatkit"]')
      .getByRole("textbox")
      .waitFor({ timeout: 60000 });
    return { b, context, p };
  } catch (error) {
    await b.close();
    throw error;
  }
}
