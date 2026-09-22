import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ContractServiceClient } from '../dist/lib/client.js';
import { ContractReviewViewProvider } from '../dist/lib/view-provider.js';
import { contractSchema, localExtractionCapabilitySchema, localExtractSchema } from '../dist/lib/contracts.js';

const scope = { hostType: 'agent', hostId: 'demo-assistant', tenantId: 'demo-tenant', organizationId: 'demo-org', userId: 'demo-user' };
const actionKeys = new Set(['update_contract', 'confirm_contract', 'get_summary', 'intake_contract']);

export async function startPreview({ serviceUrl = 'http://127.0.0.1:8097', serviceToken = process.env.CONTRACT_SERVICE_TOKEN, port = 4397, localExtraction = { enabled: false, model: 'qwen2.5:7b' } } = {}) {
  if (!serviceToken) throw new Error('CONTRACT_SERVICE_TOKEN is required. Use npm run demo for an ephemeral local token.');
  const capability = localExtractionCapabilitySchema.parse(localExtraction);
  const client = new ContractServiceClient({ serviceUrl, serviceToken, timeoutMs: 10000 });
  const provider = new ContractReviewViewProvider(client);
  let origin;
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    const reply = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    try {
      if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) return reply(403, { message: 'Local preview origin required.' });
      if (req.method === 'GET' && req.url === '/api/capabilities') return reply(200, { localExtraction: capability });
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
        if (body.actionKey === 'extract_contract' && capability.enabled) {
          const input = localExtractSchema.safeParse(body.input);
          if (!input.success) return reply(400, { message: '请填写标题和合同正文，本地提取最多支持 6,000 字。' });
          let response;
          try {
            response = await fetch(new URL('/api/contracts/extract', serviceUrl), {
              method: 'POST', redirect: 'error', signal: AbortSignal.timeout(240000),
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceToken}`, 'X-Tenant-Id': scope.tenantId, 'X-Organization-Id': scope.organizationId, 'X-User-Id': scope.userId, 'X-Assistant-Id': scope.hostId },
              body: JSON.stringify(input.data)
            });
          } catch {
            return reply(502, { message: '本地提取服务未响应，请确认 Java 和 Ollama 已启动，再用相同内容重试。' });
          }
          const raw = await readJson(response);
          if (!response.ok) {
            const messages = { 400: '合同内容不符合要求，请检查标题和正文。', 401: '本地服务凭证不匹配，请重新启动演示。', 403: '本地服务身份校验未通过，请重新启动演示。', 404: 'Java 尚未开启本地提取，请使用 npm run demo 启动。', 409: '相同请求对应的合同内容有变化，请核对后再提交。', 422: '模型返回的字段或依据不符合要求，请核对原文后重试。', 429: '本地模型正在处理另一份合同，请稍后再试。', 502: '本地模型返回异常，请确认模型已下载并在 Ollama 中可用。', 503: '本地模型暂时不可用，请确认 Ollama 已启动。', 504: '本地模型提取超时，请缩短正文后重试。' };
            return reply(response.status, { message: messages[response.status] || '本地提取失败，请检查 Java 和 Ollama 后重试。' });
          }
          const parsed = contractSchema.safeParse(raw);
          if (!parsed.success) return reply(502, { message: '合同服务返回的数据格式不正确，请检查服务版本。' });
          return reply(200, { success: true, data: parsed.data });
        }
        if (!actionKeys.has(body.actionKey)) return reply(400, { message: 'Unsupported action' });
        return reply(200, await provider.executeViewAction(scope, 'contract-review', body.actionKey, { input: body.input }));
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
  origin = `http://127.0.0.1:${server.address().port}`;
  return { server, url: origin };
}

async function readJson(response) {
  if (!response.headers.get('content-type')?.includes('application/json')) { await response.body?.cancel(); return null; }
  const chunks=[]; let size=0;
  for await (const chunk of response.body) { size+=chunk.length; if (size>2*1024*1024) throw new Error('Response is too large'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return null; }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const preview = await startPreview({ serviceUrl: process.env.CONTRACT_SERVICE_URL, port: Number(process.env.PREVIEW_PORT || 4397), localExtraction: { enabled: process.env.CONTRACT_LOCAL_EXTRACTION === 'true', model: process.env.OLLAMA_MODEL || 'qwen2.5:7b' } });
  console.log(`Local bridge preview (not Xpert deployment): ${preview.url}`);
}
