import { config, api, load, save } from "./context.mjs";
import { randomUUID, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const report = { checks: [], cleanup: [] };
// Validate prerequisites before creating any temporary authorization entities.
const documents = new Map(await Promise.all(config.cases.map(async (item) => {
  const document = await load(`${item.format}-edit2/document.json`);
  assert(document.manifest?.bindings?.length, `${item.format}: missing saved Binding`);
  return [item.format, document];
})));
try {
  await save(
    `permissions.previous-${Date.now()}.json`,
    await load("permissions.json"),
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const roles = await api("/roles");
const cleanupRole = (roles.items ?? roles).find(
  (role) => role.name === (config.cleanupRoleName ?? "VIEWER"),
);
assert(
  cleanupRole && !["ADMIN", "SUPER_ADMIN"].includes(cleanupRole.name),
  "Configure an existing non-admin cleanup role for soft-deleted test users",
);
let role, permission, user;
const assistant = await api(`/xpert/${config.assistantId}`);
const workspaceId = assistant.workspaceId;
async function detachTestWorkspaceMembership() {
  if (!user || !workspaceId) return;
  const members = await api(`/xpert-workspace/${workspaceId}/members`);
  if (members.some((member) => member.id === user.id)) {
    await api(
      `/xpert-workspace/${workspaceId}/members`,
      "PUT",
      members
        .filter((member) => member.id !== user.id)
        .map((member) => member.id),
    );
    assert(
      !(await api(`/xpert-workspace/${workspaceId}/members`)).some(
        (member) => member.id === user.id,
      ),
    );
    report.detachedTestWorkspaceMembership = true;
  }
}
try {
  const password = randomBytes(32).toString("base64url"),
    email = `dashboard-regression-${randomUUID()}@local.test`;
  role = await api("/roles", "POST", {
    name: `DASHBOARD_REGRESSION_${randomUUID()}`,
  });
  report.roleId = role.id;
  await save("permissions.json", report);
  permission = await api("/role-permissions", "POST", {
    roleId: role.id,
    permission: "DATA_SOURCE_VIEW",
    enabled: true,
  });
  user = await api("/user", "POST", {
    email,
    username: email,
    firstName: "Dashboard regression viewer",
    hash: password,
    roleId: role.id,
  });
  report.userId = user.id;
  await save("permissions.json", report);
  await api("/user-organization", "POST", {
    userId: user.id,
    organizationId: config.orgId,
    isActive: true,
  });
  await api(`/xpert/${config.assistantId}/sharing/users`, "POST", {
    userIds: [user.id],
  });
  const login = await fetch(config.apiUrl + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert(login.ok, "Test viewer login failed");
  const auth = await login.json();
  assert.equal(auth.user.id, user.id, "Login returned another identity");
  // This JWT is intentionally reused after every revocation. Never write it to the receipt.
  const headers = {
    Authorization: `Bearer ${auth.token}`,
    "tenant-id": user.tenantId,
    "organization-id": config.orgId,
    "content-type": "application/json",
  };
  const call = async (path, body) => {
    const response = await fetch(config.apiUrl + "/api" + path, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  for (const item of config.cases) {
    const document = documents.get(item.format),
      binding = document.manifest.bindings[0];
    const query = () =>
      call("/data-source/analytics/query", {
        binding,
        controls: { region: null },
      });
    const inspect = () =>
      call("/data-source/analytics/discover", {
        dataSourceId: binding.dataSourceId,
        providerId: binding.providerId,
        request: { datasetId: "q3_sales" },
      });
    assert.equal((await query()).status, 201, "Initial viewer file access");
    await api(`/role-permissions/${permission.id}`, "PUT", { enabled: false });
    const deniedQuery = await query(),
      deniedDiscovery = await inspect();
    assert.equal(deniedQuery.status, 403);
    assert.equal(deniedDiscovery.status, 403);
    await api(`/role-permissions/${permission.id}`, "PUT", { enabled: true });
    assert.equal((await query()).status, 201, "Restored permission");
    // Default organization bootstrap may add a new user to the Assistant's
    // authoring workspace. Remove only that test user's independent grant.
    await detachTestWorkspaceMembership();
    await api(
      `/xpert/${config.assistantId}/sharing/users/${user.id}`,
      "DELETE",
    );
    const fileDenied = await query();
    report.checks.push({
      format: item.format,
      stage: "fileGrantRevoked",
      status: fileDenied.status,
      code: fileDenied.body.code,
      hasRows: Array.isArray(fileDenied.body.rows),
      hasData: fileDenied.body.data !== undefined,
    });
    await save("permissions.json", report);
    assert(
      [403, 404].includes(fileDenied.status) &&
        !Array.isArray(fileDenied.body.rows) &&
        fileDenied.body.data === undefined,
      "Revoked Assistant file grant did not deny the query",
    );
    await api(`/xpert/${config.assistantId}/sharing/users`, "POST", {
      userIds: [user.id],
    });
    assert.equal((await query()).status, 201, "Restored Assistant file grant");
    report.checks.push({
      format: item.format,
      sameJwt: true,
      fileGrantRevoked: fileDenied.status,
      permissionRevoked: { query: 403, discovery: 403 },
      restored: 201,
    });
    await save("permissions.json", report);
  }
  report.passed = true;
} catch (error) {
  report.error = error.message;
  throw error;
} finally {
  // Only remove entities created by this run; retain IDs and cleanup failures for recovery.
  for (const [label, path] of [
    ...(user
      ? [
          [
            "assistantGrant",
            `/xpert/${config.assistantId}/sharing/users/${user.id}`,
          ],
          ["testUser", `/user/${user.id}`],
        ]
      : []),
    ...(permission
      ? [["permission", `/role-permissions/${permission.id}`]]
      : []),
    ...(role ? [["testRole", `/roles/${role.id}`]] : []),
  ]) {
    try {
      if (label === "testUser") {
        await detachTestWorkspaceMembership();
        // The public delete API soft-deletes users. Detach the temporary role
        // first so its FK is not retained; the existing role is never modified.
        await api(`/user/${user.id}`, "PUT", {
          isActive: false,
          roleId: cleanupRole.id,
        });
      }
      await api(path, "DELETE");
      report.cleanup.push({ label, removed: true });
    } catch (error) {
      report.cleanup.push({ label, removed: false, error: error.message });
    }
  }
  await save("permissions.json", report);
  assert(
    report.cleanup.every((item) => item.removed),
    "Cleanup incomplete; inspect permissions.json before retrying",
  );
}
console.log(
  JSON.stringify({
    passed: report.passed,
    cases: report.checks.filter((check) => check.sameJwt).length,
    cleanup: report.cleanup,
  }),
);
