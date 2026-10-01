#!/usr/bin/env node

// Standard resource packages use /agent-plugins, never the native module installer.
// Authentication and organization headers stay in the platform's shared CLI helper.
import { readFile, readdir, mkdir, writeFile, lstat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import archiver from "archiver";
import { z } from "zod";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const catalogSchema = z
  .object({
    version: z.literal(1),
    plugins: z.array(
      z
        .object({
          id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
          oauthServers: z.array(z.string()).default([]),
        })
        .strict(),
    ),
  })
  .strict();

export async function loadQuickstartPlugins() {
  const catalog = catalogSchema.parse(
    JSON.parse(await readFile(join(packageRoot, "quickstart.json"), "utf8")),
  );
  return Promise.all(
    catalog.plugins.map(async (entry) => {
      const root = join(packageRoot, entry.id);
      const manifest = JSON.parse(
        await readFile(join(root, "plugin.json"), "utf8"),
      );
      return {
        ...entry,
        root,
        title:
          manifest.extensions?.["xpertai"]?.interface?.displayName ||
          manifest.name,
        description: manifest.description,
        version: manifest.version,
        connectorServers: manifest.extensions?.["xpertai"]?.connectors || {},
      };
    }),
  );
}

export async function packQuickstartPlugin(plugin) {
  const files = [];
  let bytes = 0;
  async function collect(directory, prefix = "") {
    for (const item of (await readdir(directory, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const name = prefix + item.name;
      const resource = /^(skills|assets|docs)(\/|$)/.test(name);
      const safe = !name.split('/').some((part) => part.startsWith('.') || ['node_modules', '__pycache__'].includes(part));
      if (
        item.isDirectory() &&
        resource && safe
      ) {
        await collect(join(directory, item.name), name + "/");
      } else if (
        item.isFile() &&
        safe &&
        (["plugin.json", "mcp.json", "README.md", "LICENSE", "LICENSE.txt"].includes(name) ||
          (resource && /\.(md|mdx|py|mjs|txt|json|yaml|yml|png|jpg|jpeg|svg|webp)$/.test(name)))
      ) {
        const info = await lstat(join(directory, item.name));
        bytes += info.size;
        if (!info.isFile() || files.length >= 10000 || bytes > 100 * 1024 * 1024)
          throw new Error(`Invalid or oversized quickstart package entry: ${name}`);
        files.push({
          name,
          content: await readFile(join(directory, item.name)),
        });
      } else {
        throw new Error(`Unexpected quickstart package entry: ${name}`);
      }
    }
  }
  await collect(plugin.root);
  const archive = archiver("zip", { zlib: { level: 9 } });
  const result = new Promise((resolve, reject) => {
    const chunks = [];
    archive.on("data", (chunk) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
    archive.on("warning", reject);
  });
  for (const { name, content } of files)
    archive.append(content, { name, date: new Date("1980-01-01T00:00:00Z") });
  const [buffer] = await Promise.all([result, archive.finalize()]);
  return buffer;
}

export function createAgentPluginApi(apiUrl, headers, fetcher = fetch) {
  const base =
    apiUrl.replace(/\/+$/, "").replace(/\/api$/, "") + "/api/agent-plugins";
  return async (path = "", method = "GET", body) => {
    const multipart = body instanceof FormData;
    const requestHeaders = { ...headers };
    if (multipart) delete requestHeaders["content-type"];
    const response = await fetcher(base + path, {
      method,
      headers: requestHeaders,
      signal: AbortSignal.timeout(120000),
      ...(body === undefined
        ? {}
        : { body: multipart ? body : JSON.stringify(body) }),
    });
    if (!response.ok)
      throw new Error(
        `Agent Plugins ${method} ${path || "/"} failed (HTTP ${response.status}). Check organization scope, workspace access and package diagnostics.`,
      );
    return response.json();
  };
}

export async function installQuickstartPlugin(
  plugin,
  workspaceId,
  api,
  { replace = false } = {},
) {
  // Check the destination before importing or creating any organization resource.
  const options = await api("/options");
  if (!options.workspaces.some((workspace) => workspace.id === workspaceId)) {
    throw new Error(
      "The selected organization does not expose this workspace for management.",
    );
  }
  const form = new FormData();
  form.append(
    "file",
    new Blob([await packQuickstartPlugin(plugin)], { type: "application/zip" }),
    plugin.id + ".zip",
  );
  const pkg = await api("/zip", "POST", form);
  if (pkg.descriptor.diagnostics.length || !(pkg.descriptor.servers.length || pkg.descriptor.skills?.length)) {
    throw new Error(
      `${plugin.id}: import has component diagnostics; review it before publishing.`,
    );
  }
  const { packages, bindings } = await api();
  const oauthServers = [...plugin.oauthServers].sort();
  const existing = bindings.filter(
    (binding) =>
      !binding.supersededById &&
      binding.workspaceIds.includes(workspaceId) &&
      binding.definition.kind === "agent_plugin",
  );
  if (
    !replace &&
    existing.some(
      (binding) =>
        !binding.enabled &&
        packages.some(
          (candidate) =>
            candidate.id === binding.definition.packageId &&
            candidate.descriptor.name === pkg.descriptor.name,
        ),
    )
  ) {
    throw new Error(
      `${plugin.id}: this resource was disabled. Review it in the administrator UI before enabling it.`,
    );
  }
  const active = existing.filter((binding) => binding.enabled);
  const matching = active.find(
    (binding) =>
      binding.definition.packageId === pkg.id &&
      JSON.stringify([...(binding.definition.oauthServers || [])].sort()) ===
        JSON.stringify(oauthServers) &&
      JSON.stringify(binding.definition.connectorServers || {}) ===
        JSON.stringify(plugin.connectorServers || {}) &&
      Object.keys(binding.definition.experts || {}).length === 0,
  );
  if (matching)
    return { plugin: plugin.id, state: "already_published", binding: matching };
  const previous = existing.filter((binding) =>
    packages.some(
      (candidate) =>
        candidate.id === binding.definition.packageId &&
        candidate.descriptor.name === pkg.descriptor.name,
    ),
  );
  if (previous.length > 1)
    throw new Error(
      `${plugin.id}: multiple existing bindings require administrator review.`,
    );
  if (previous.length && !replace) {
    throw new Error(
      `${plugin.id}: a different version or authorization configuration is already published. Use the administrator version-replacement flow.`,
    );
  }
  const binding = await api("/bindings", "POST", {
    ...(replace && previous.length
      ? { replacesBindingId: previous[0].id }
      : {}),
    title: plugin.title,
    description: plugin.description,
    workspaceIds: [workspaceId],
    definition: {
      kind: "agent_plugin",
      packageId: pkg.id,
      experts: {},
      oauthServers,
      connectorServers: plugin.connectorServers || {},
    },
  });
  return { plugin: plugin.id, state: "published", binding };
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      list: { type: "boolean" },
      pack: { type: "boolean" },
      install: { type: "boolean" },
      replace: { type: "boolean" },
      help: { type: "boolean" },
      "no-keychain": { type: "boolean" },
      "output-dir": { type: "string" },
      "platform-root": { type: "string" },
      "api-url": { type: "string" },
      "org-id": { type: "string" },
      "workspace-id": { type: "string" },
    },
  });
  const args = {
    ...values,
    _: positionals,
    outputDir: values["output-dir"],
    platformRoot: values["platform-root"],
    apiUrl: values["api-url"],
    orgId: values["org-id"],
    workspaceId: values["workspace-id"],
    noKeychain: values["no-keychain"],
  };
  if (args.help) {
    console.log(`Standard Agent Plugins quickstart (no native server code).

  corepack pnpm quickstart --list
  corepack pnpm quickstart --pack --output-dir <directory> [exa notion]
  corepack pnpm quickstart --install --platform-root <xpert-checkout> --api-url <origin> --org-id <id> --workspace-id <id> [exa notion]

Default: list packages. Pack with no names selects all packages. Install requires explicit names.
Install uses configured Xpert login credentials or Keychain; third-party OAuth
is completed separately by each user in the conversation plugin details.
Existing matching bindings are reused. --replace creates a new version while preserving existing conversations.
XPERT_PLATFORM_ROOT, XPERT_API_URL, XPERT_ORG_ID and XPERT_WORKSPACE_ID are supported.`);
    return;
  }
  if ([args.list, args.pack, args.install].filter(Boolean).length > 1)
    throw new Error("Choose one of --list, --pack or --install.");
  const available = await loadQuickstartPlugins();
  if (args.install && !args._.length)
    throw new Error(
      "Specify the plugins to install, for example: notion linear sentry.",
    );
  const selected = args._.length
    ? available.filter((entry) => args._.includes(entry.id))
    : available;
  const unknown = args._.filter(
    (name) => !available.some((entry) => entry.id === name),
  );
  if (unknown.length)
    throw new Error(`Unknown quickstart plugin: ${unknown.join(", ")}`);
  if (!args.pack && !args.install) {
    for (const plugin of selected)
      console.log(
        `${plugin.id}\t${plugin.version}\t${Object.keys(plugin.connectorServers).length ? "Connector" : plugin.oauthServers.length ? "personal OAuth" : "no API key"}\t${plugin.description}`,
      );
    return;
  }
  if (args.pack) {
    if (!args.outputDir)
      throw new Error("--output-dir is required for --pack.");
    const output = resolve(args.outputDir);
    await mkdir(output, { recursive: true });
    for (const plugin of selected) {
      const target = join(output, `${plugin.id}-${plugin.version}.zip`);
      await writeFile(target, await packQuickstartPlugin(plugin));
      console.log(`${plugin.id}: ${target}`);
    }
    return;
  }
  const workspaceId = args.workspaceId || process.env.XPERT_WORKSPACE_ID;
  const orgId = args.orgId || process.env.XPERT_ORG_ID;
  if (!workspaceId || !orgId)
    throw new Error("--workspace-id and --org-id are required for --install.");
  z.string().uuid().parse(workspaceId);
  z.string().uuid().parse(orgId);
  const platformRoot = args.platformRoot || process.env.XPERT_PLATFORM_ROOT;
  if (!platformRoot)
    throw new Error(
      "--platform-root is required for --install (Xpert shared authentication helper).",
    );
  const { createRequestHeaders, requireAuthentication, DEFAULT_API_URL } =
    await import(
      pathToFileURL(
        join(resolve(platformRoot), "tools/scripts/local-plugin-cli.mjs"),
      ).href
    );
  const apiUrl = args.apiUrl || process.env.XPERT_API_URL || DEFAULT_API_URL;
  const authentication = await requireAuthentication({ ...args, apiUrl });
  const headers = createRequestHeaders(
    { ...args, scope: "organization", orgId },
    authentication.token,
    authentication.tenantId,
  );
  const api = createAgentPluginApi(apiUrl, headers);
  for (const plugin of selected) {
    const result = await installQuickstartPlugin(plugin, workspaceId, api, {
      replace: !!args.replace,
    });
    console.log(
      `${result.plugin}: ${result.state}${plugin.oauthServers.length || Object.keys(plugin.connectorServers).length ? "; each user must connect their account" : ""}`,
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
