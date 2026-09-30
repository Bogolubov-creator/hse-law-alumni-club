import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadConfig, measure } from '../diagnostics/measure-load.mjs';

async function localServer(t, handler, tls) {
  const server = tls ? https.createServer(tls, handler) : http.createServer(handler);
  server.listen(0, 'localhost');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return `${tls ? 'https' : 'http'}://localhost:${server.address().port}`;
}
const config = origin => loadConfig({ LOAD_SYNTHETIC: 'true', LOAD_BASE_URL: origin, LOAD_ENDPOINTS: 'ready', LOAD_MAX_REQUESTS: '4', LOAD_DURATION_SECONDS: '2', LOAD_REQUESTS_PER_SECOND: '10' });

test('отклоняет публичные цели, credentials, произвольные маршруты и чрезмерные пределы', () => {
  const env = { LOAD_SYNTHETIC: 'true', LOAD_BASE_URL: 'http://localhost:8000' };
  for (const change of [
    { LOAD_SYNTHETIC: '' }, { LOAD_BASE_URL: 'https://example.com' }, { LOAD_BASE_URL: 'http://secret:token@localhost' },
    { LOAD_BASE_URL: 'http://localhost/api' }, { LOAD_ENDPOINTS: 'auth' }, { LOAD_ENDPOINTS: '__proto__' },
    { LOAD_REQUESTS_PER_SECOND: '100' }, { LOAD_DURATION_SECONDS: '301' }, { LOAD_CONCURRENCY: '9' },
    { LOAD_MAX_REQUESTS: '3001' }, { NODE_TLS_REJECT_UNAUTHORIZED: '0' },
  ]) assert.throws(() => loadConfig({ ...env, ...change }));
});

test('только GET, ограничение запросов и concurrency, тело ответа не попадает в отчёт', async t => {
  let active = 0, peak = 0, calls = 0;
  const origin = await localServer(t, (req, res) => {
    calls++; active++; peak = Math.max(peak, active);
    assert.equal(req.method, 'GET'); assert.equal(req.url, '/api/ready'); assert.equal(req.headers.authorization, undefined);
    setTimeout(() => { active--; res.writeHead(200, { 'content-type': 'application/json' }).end('{"secret":"must-not-leak"}'); }, 250);
  });
  const report = await measure({ ...config(origin), concurrency: 2 });
  assert.equal(calls, 4); assert.equal(report.totalRequests, 4); assert.equal(report.sent, 3); assert.equal(report.successful, 3);
  assert.equal(report.stopReason, 'max_requests'); assert.equal(report.warmup.length, 1);
  assert.equal(peak, 2); assert.equal(report.latency.samples, 3); assert.ok(report.latency.p95Ms >= 200);
  assert.equal(JSON.stringify(report).includes('must-not-leak'), false);
});

test('останавливает нагрузку при первом 429', async t => {
  let calls = 0;
  const origin = await localServer(t, (_req, res) => res.writeHead(++calls === 1 ? 200 : 429, { 'content-type': 'application/json' }).end('{}'));
  const report = await measure(config(origin));
  assert.equal(calls, 2); assert.equal(report.stopReason, 'rate_limited'); assert.deepEqual(report.codes, { 429: 1 });
});

test('общий дедлайн прерывает зависший ответ ещё до нагрузки', async t => {
  const origin = await localServer(t, () => {});
  const report = await measure({ ...config(origin), timeoutMs: 100 });
  assert.equal(report.stopReason, 'warmup_failed'); assert.equal(report.sent, 0);
  assert.equal(report.warmup[0].code, 'TIMEOUT');
});

test('локальный TLS без доверенного CA отклоняется, с указанным CA проходит', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'club-load-tls-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cert = join(directory, 'cert.pem'), key = join(directory, 'key.pem'), openssl = join(directory, 'openssl.cnf');
  await writeFile(openssl, '[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ext\n[dn]\nCN=localhost\n[ext]\nsubjectAltName=DNS:localhost\nbasicConstraints=critical,CA:true\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\nextendedKeyUsage=serverAuth\n');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-config', openssl, '-keyout', key, '-out', cert], { stdio: 'ignore' });
  const origin = await localServer(t, (_req, res) => res.writeHead(200, { 'content-type': 'application/json' }).end('{}'), { key: await readFile(key), cert: await readFile(cert) });
  const untrusted = await measure(config(origin));
  assert.equal(untrusted.stopReason, 'warmup_failed'); assert.equal(untrusted.sent, 0);
  assert.notEqual(untrusted.warmup[0].code, '200');
  const trusted = await measure({ ...config(origin), caFile: cert });
  assert.equal(trusted.successful, 3); assert.equal(trusted.tlsVerification, 'provided-ca');
});
