// Run from xpert-pro with ts-node; see the plugin acceptance guide.
const platformRoot = process.cwd();
const pluginRoot = process.env.WORKSPACE_SCRIPT_PLUGIN_ROOT;
if (!pluginRoot)
  throw new Error(
    "WORKSPACE_SCRIPT_PLUGIN_ROOT must point to the plugin checkout"
  );
require = require("node:module").createRequire(platformRoot + "/package.json");
const assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os"),
  { randomUUID } = require("node:crypto");
const Docker = require("dockerode");
const { DockerSandboxRuntimeProvider } = require(path.join(
  platformRoot,
  "packages/server-ai/src/sandbox-docker/plugins/docker-runtime.provider.ts"
));
const definition = require(path.join(
  platformRoot,
  "packages/server-ai/src/sandbox/sandbox-job/runtime-definitions/compute-node-python-v1.json"
));
const docker = new Docker({ socketPath: "/var/run/docker.sock" });
const provider = new DockerSandboxRuntimeProvider(
  { getDocker: async () => docker },
  { rememberContainerContext: async () => {}, markExpectedStop: async () => {} }
);
(async () => {
  const binding = (await provider.listBindings()).find(
    (b) => b.runtimeProfile === definition.name
  );
  const receipts = [];
  for (const scenario of ["isolation", "cancel", "symlink"]) {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "workspace-script-isolation-")
    );
    await fs.chmod(root, 0o755);
    const id = randomUUID();
    const options = {
      tenantId: "workspace-script-acceptance",
      workFor: { type: "job", id },
      definition,
      binding,
      volume: { serverRoot: root, hostRoot: root },
      ephemeral: true,
      resources: definition.resources,
      networkPolicy: definition.networkPolicy,
      security: definition.security,
      hardDeadlineMs: 5000,
    };
    let runtime;
    try {
      runtime = await provider.create(options);
      const inspection = await docker.getContainer(runtime.id).inspect();
      assert.equal(inspection.HostConfig.NetworkMode, "none");
      assert.equal(inspection.HostConfig.ReadonlyRootfs, true);
      assert.equal(inspection.HostConfig.Binds[0].endsWith(":ro"), true);
      assert.equal(inspection.Config.User, "10001:10001");
      const code =
        scenario === "cancel"
          ? "export async function query(){while(true){}}"
          : scenario === "symlink"
          ? "import fs from 'node:fs'; export async function query(){fs.symlinkSync('/etc/passwd','/workspace/output/escape');return {columns:[],rows:[]}}"
          : `import fs from 'node:fs'; export async function query(ctx){let readOnly=false,networkDenied=false;try{fs.writeFileSync('/workspace/input/forbidden','x')}catch(e){readOnly=e.code==='EROFS'}try{await fetch('http://1.1.1.1',{signal:AbortSignal.timeout(400)})}catch{networkDenied=true}return ctx.dataset([{readOnly,networkDenied}])}`;
      const files = [
        ["/workspace/input/script", Buffer.from(code)],
        [
          "/workspace/input/job.json",
          Buffer.from(
            JSON.stringify({
              payload: {
                language: "javascript",
                parameters: {},
                outputKeys: ["readOnly", "networkDenied"],
              },
            })
          ),
        ],
        [
          "/workspace/runtime/action-manifest.json",
          Buffer.from(
            JSON.stringify({
              name: "workspace_script.execute",
              version: "1.0.0",
              runtimeContractVersion: "1",
              entrypoint: "runner.mjs",
            })
          ),
        ],
      ];
      for (const name of [
        "runner.mjs",
        "javascript.mjs",
        "python.py",
        "csv.mjs",
      ])
        files.push([
          "/workspace/runtime/action/" + name,
          await fs.readFile(path.join(pluginRoot, "sandbox-actions", name)),
        ]);
      assert.equal(
        (await runtime.uploadFiles(files)).every((f) => !f.error),
        true
      );
      const argv = [
        ...definition.command,
        "--request",
        "/workspace/input/job.json",
        "--output",
        "/workspace/output",
        "--action-root",
        "/workspace/runtime/action",
        "--action-manifest",
        "/workspace/runtime/action-manifest.json",
      ];
      const running = runtime.execute(argv, { timeoutMs: 2500 });
      if (scenario === "cancel") setTimeout(() => runtime.terminate(), 300);
      const result = await running;
      if (scenario === "cancel")
        assert.equal(result.terminationReason, "cancelled");
      else {
        assert.equal(result.exitCode, 0, result.output);
        if (scenario === "isolation") {
          const out = (
            await runtime.downloadFiles(["/workspace/output/dataset.json"])
          )[0];
          assert.deepEqual(
            JSON.parse(Buffer.from(out.content).toString()).rows,
            [{ readOnly: true, networkDenied: true }]
          );
        } else
          assert.notEqual(
            (await runtime.downloadFiles(["/workspace/output/escape"]))[0]
              .error,
            null
          );
      }
      receipts.push({ scenario, passed: true });
    } finally {
      await provider.destroy({
        tenantId: options.tenantId,
        workFor: options.workFor,
        runtimeProfile: definition.name,
        runtimeBindingId: binding.id,
        artifact: binding.artifact,
        runtimeRef: runtime?.id,
      });
      await fs.rm(root, { recursive: true, force: true });
      assert.equal(
        (
          await docker.listContainers({
            all: true,
            filters: JSON.stringify({
              label: ["xpert.sandbox.work_for_id=" + id],
            }),
          })
        ).length,
        0
      );
    }
  }
  console.log(JSON.stringify(receipts));
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
