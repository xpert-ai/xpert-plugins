import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";

// Local, disposable protocol fixture. It never authorizes a third-party account.
export async function startConnectorMcpFixture(platformRoot, callbackOrigin) {
  const require = createRequire(join(platformRoot, "package.json"));
  const express = require("express");
  const {
    McpServer,
  } = require("@modelcontextprotocol/sdk-oauth/server/mcp.js");
  const {
    StreamableHTTPServerTransport,
  } = require("@modelcontextprotocol/sdk-oauth/server/streamableHttp.js");
  const { z } = require("zod/v4");
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  const codes = new Map(),
    access = new Set(),
    refresh = new Map();
  const stats = { calls: 0, refreshes: 0, registrations: 0, uiReads: 0 };
  let base;
  app.get("/.well-known/oauth-protected-resource/v2/mcp", (_q, r) =>
    r.json({ resource: base + "/v2/mcp", authorization_servers: [base] }),
  );
  app.get("/.well-known/oauth-authorization-server", (_q, r) =>
    r.json({
      issuer: base,
      authorization_endpoint: base + "/authorize",
      token_endpoint: base + "/token",
      registration_endpoint: base + "/register",
      response_types_supported: ["code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    }),
  );
  app.post("/register", (q, r) => {
    stats.registrations++;
    r.status(201).json({
      ...q.body,
      client_id: "fixture-client",
      token_endpoint_auth_method: "none",
    });
  });
  app.get("/authorize", (q, r) => {
    const callback = new URL(q.query.redirect_uri);
    if (
      callback.origin !== callbackOrigin ||
      callback.pathname !== "/api/connector/oauth/callback" ||
      q.query.resource !== base + "/v2/mcp"
    )
      return r.status(400).end();
    const code = randomUUID();
    codes.set(code, {
      verifierHash: q.query.code_challenge,
      redirect: q.query.redirect_uri,
    });
    callback.searchParams.set("code", code);
    callback.searchParams.set("state", q.query.state);
    r.redirect(callback.href);
  });
  app.post("/token", (q, r) => {
    if (
      q.body.resource !== base + "/v2/mcp" ||
      q.body.client_id !== "fixture-client"
    )
      return r.status(400).json({ error: "invalid_request" });
    if (q.body.grant_type === "refresh_token") {
      const previous = refresh.get(q.body.refresh_token);
      if (!previous) return r.status(400).json({ error: "invalid_grant" });
      access.delete(previous);
      refresh.delete(q.body.refresh_token);
      stats.refreshes++;
    } else {
      const code = codes.get(q.body.code);
      if (
        !code ||
        code.redirect !== q.body.redirect_uri ||
        code.verifierHash !==
          createHash("sha256")
            .update(q.body.code_verifier || "")
            .digest("base64url")
      )
        return r.status(400).json({ error: "invalid_grant" });
      codes.delete(q.body.code);
    }
    const token = randomUUID(),
      refreshToken = randomUUID();
    access.add(token);
    refresh.set(refreshToken, token);
    // Initial expiry forces one refresh through Connector before the MCP call.
    r.json({
      access_token: token,
      refresh_token: refreshToken,
      token_type: "Bearer",
      expires_in: stats.refreshes ? 3600 : 1,
      scope: "read",
    });
  });
  app.all("/v2/mcp", async (q, r) => {
    if (!access.has((q.headers.authorization || "").replace(/^Bearer /, "")))
      return r
        .status(401)
        .set(
          "WWW-Authenticate",
          `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/v2/mcp"`,
        )
        .end();
    if (q.method !== "POST") return r.status(405).end();
    const server = new McpServer({
      name: "connector-fixture",
      version: "1.0.0",
    });
    server.registerTool(
      "connector_echo",
      {
        description: "Echo a verification marker.",
        inputSchema: { text: z.string() },
        _meta: { ui: { resourceUri: "ui://connector/probe.html" } },
      },
      async ({ text }) => {
        stats.calls++;
        return {
          content: [{ type: "text", text: "CONNECTOR_MCP_OK:" + text }],
          structuredContent: { text },
        };
      },
    );
    server.resource(
      "connector-ui",
      "ui://connector/probe.html",
      { mimeType: "text/html;profile=mcp-app" },
      async () => {
        stats.uiReads++;
        return {
          contents: [
            {
              uri: "ui://connector/probe.html",
              mimeType: "text/html;profile=mcp-app",
              text: "<!doctype html><html><body>Connector MCP UI</body></html>",
            },
          ],
        };
      },
    );
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    r.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(q, r, q.body);
  });
  const listener = await new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
  base = `http://127.0.0.1:${listener.address().port}`;
  return {
    url: base + "/v2/mcp",
    stats,
    close: () => new Promise((resolve) => listener.close(resolve)),
  };
}
