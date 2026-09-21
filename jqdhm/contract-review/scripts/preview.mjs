import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ContractServiceClient } from '../dist/lib/client.js';
import { ContractReviewViewProvider } from '../dist/lib/view-provider.js';

const scope = { hostType: 'agent', hostId: 'demo-assistant', tenantId: 'demo-tenant', organizationId: 'demo-org', userId: 'demo-user' };
const actionKeys = new Set(['update_contract', 'confirm_contract', 'get_summary']);

export async function startPreview({ serviceUrl = 'http://127.0.0.1:8097', serviceToken = process.env.CONTRACT_SERVICE_TOKEN, port = 4397 } = {}) {
  if (!serviceToken) throw new Error('CONTRACT_SERVICE_TOKEN is required. Use npm run demo for an ephemeral local token.');
  const client = new ContractServiceClient({ serviceUrl, serviceToken, timeoutMs: 10000 });
  const provider = new ContractReviewViewProvider(client);
  const origin = `http://127.0.0.1:${port}`;
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    const reply = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    try {
      if (req.headers.host !== `127.0.0.1:${port}` || (req.headers.origin && req.headers.origin !== origin)) return reply(403, { message: 'Local preview origin required.' });
      if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(await readFile(new URL('./preview-host.html', import.meta.url), 'utf8')); return;
      }
      if (req.method === 'GET' && req.url === '/workbench') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(await readFile(new URL('../dist/remote/contract-review.html', import.meta.url), 'utf8')); return;
      }
      if (req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) return reply(404, { message: 'Not found' });
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 262144) return reply(413, { message: 'Request is too large' }); chunks.push(chunk); }
      let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return reply(400, { message: 'Invalid JSON' }); }
      if (!body || Array.isArray(body) || typeof body !== 'object') return reply(400, { message: 'Expected an object' });
      if (req.url === '/api/view') return reply(200, await provider.getViewData(scope, 'contract-review', body.query || {}));
      if (req.url === '/api/action') {
        if (!actionKeys.has(body.actionKey)) return reply(400, { message: 'Unsupported action' });
        return reply(200, await provider.executeViewAction(scope, 'contract-review', body.actionKey, { input: body.input, targetId: body.input?.contractId }));
      }
      if (req.url === '/api/fixture') {
        const fixture = JSON.parse(await readFile(new URL('../examples/draft.json', import.meta.url), 'utf8'));
        fixture.requestKey = 'local-fixture-' + randomUUID();
        const response = await fetch(new URL('/api/contracts', serviceUrl), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceToken}`, 'X-Tenant-Id': scope.tenantId, 'X-Organization-Id': scope.organizationId, 'X-User-Id': scope.userId, 'X-Assistant-Id': scope.hostId }, body: JSON.stringify(fixture) });
        if (!response.ok) return reply(502, { message: 'Java service rejected the fixture. Check service startup and configuration.' });
        return reply(201, await response.json());
      }
      return reply(404, { message: 'Not found' });
    } catch {
      reply(502, { message: 'Backend request failed. Check the Java service and plugin configuration.' });
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { server, url: origin };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const preview = await startPreview({ serviceUrl: process.env.CONTRACT_SERVICE_URL, port: Number(process.env.PREVIEW_PORT || 4397) });
  console.log(`Local bridge preview (not Xpert deployment): ${preview.url}`);
}
