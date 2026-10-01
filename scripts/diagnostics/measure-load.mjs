#!/usr/bin/env node
import http from 'node:http';
import https from 'node:https';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const ROUTES = Object.freeze({
  ready: '/api/ready', home: '/api/pages/home', programs: '/api/programs',
  products: '/api/products', events: '/api/events', podcasts: '/api/podcasts', news: '/api/news?limit=20',
});
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

function number(env, name, fallback, minimum, maximum, integer = true) {
  const raw = env[name] ?? String(fallback);
  const value = Number(raw);
  if (!/^\d+(?:\.\d+)?$/.test(raw) || !Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < minimum || value > maximum) {
    throw new Error(`${name}: допустимо от ${minimum} до ${maximum}${integer ? ', целое число' : ''}`);
  }
  return value;
}

export function loadConfig(env = process.env) {
  if (env.LOAD_SYNTHETIC !== 'true') throw new Error('Требуется LOAD_SYNTHETIC=true для одноразового синтетического стенда');
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('Отключение проверки TLS запрещено');
  let base;
  try { base = new URL(env.LOAD_BASE_URL); } catch { throw new Error('Требуется корректный LOAD_BASE_URL'); }
  if (!['http:', 'https:'].includes(base.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)
    || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('LOAD_BASE_URL должен быть loopback origin без пути, credentials, query и fragment');
  }
  const endpoints = (env.LOAD_ENDPOINTS ?? Object.keys(ROUTES).join(',')).split(',');
  if (!endpoints.length || new Set(endpoints).size !== endpoints.length || endpoints.some(name => !Object.hasOwn(ROUTES, name))) {
    throw new Error(`LOAD_ENDPOINTS: допустимые имена ${Object.keys(ROUTES).join(',')}`);
  }
  return {
    origin: base.origin, endpoints, caFile: env.HTTPS_CA_FILE,
    durationSeconds: number(env, 'LOAD_DURATION_SECONDS', 30, 1, 300),
    concurrency: number(env, 'LOAD_CONCURRENCY', 2, 1, 8),
    requestsPerSecond: number(env, 'LOAD_REQUESTS_PER_SECOND', 5, 1, 10, false),
    maxRequests: number(env, 'LOAD_MAX_REQUESTS', 150, endpoints.length + 1, 3000),
    timeoutMs: number(env, 'LOAD_TIMEOUT_MS', 5000, 100, 10000),
  };
}

const rounded = value => Math.round(value * 1000) / 1000;
function latency(values) {
  if (!values.length) return { samples: 0, minMs: null, p50Ms: null, p95Ms: null, p99Ms: null, maxMs: null };
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = p => rounded(sorted[Math.ceil(p * sorted.length) - 1]);
  return { samples: sorted.length, minMs: rounded(sorted[0]), p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99), maxMs: rounded(sorted.at(-1)) };
}
function summarize(samples) {
  const codes = {};
  for (const sample of samples) codes[sample.code] = (codes[sample.code] ?? 0) + 1;
  const successful = samples.filter(sample => sample.ok);
  return {
    completed: samples.length, successful: successful.length, failed: samples.length - successful.length,
    responseBytes: samples.reduce((sum, sample) => sum + sample.bytes, 0), codes,
    latency: latency(samples.map(sample => sample.ms)), successfulLatency: latency(successful.map(sample => sample.ms)),
  };
}

function request(origin, endpoint, agent, timeoutMs, signal) {
  return new Promise(resolve => {
    const started = performance.now();
    let bytes = 0, finished = false;
    const done = (code, ok) => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      resolve({ endpoint, code: String(code), ok, bytes, ms: performance.now() - started });
    };
    const url = new URL(ROUTES[endpoint], origin);
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.get(url, { agent, signal, headers: { accept: 'application/json', 'user-agent': 'club-synthetic-load/1' } }, response => {
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > MAX_RESPONSE_BYTES) { done('RESPONSE_TOO_LARGE', false); response.destroy(); req.destroy(); }
      });
      response.on('end', () => {
        const status = response.statusCode ?? 0;
        const json = /^application\/json(?:;|$)/i.test(response.headers['content-type'] ?? '');
        done(status === 200 && !json ? 'NON_JSON_200' : status, status === 200 && json);
      });
      response.on('error', () => done('RESPONSE_ERROR', false));
    });
    const timer = setTimeout(() => { done('TIMEOUT', false); req.destroy(); }, timeoutMs);
    req.on('error', error => done(/^[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'NETWORK_ERROR', false));
  });
}

export async function measure(config, signal = new AbortController().signal) {
  const tls = config.origin.startsWith('https:');
  const ca = config.caFile ? await readFile(config.caFile) : undefined;
  const agent = tls
    ? new https.Agent({ keepAlive: true, maxSockets: config.concurrency, rejectUnauthorized: true, ...(ca ? { ca } : {}) })
    : new http.Agent({ keepAlive: true, maxSockets: config.concurrency });
  const startedAt = new Date().toISOString();
  const warmup = [], samples = [], running = new Set();
  let stopReason = 'duration', consecutiveFailures = 0, sent = 0;
  let started = performance.now();
  try {
    for (const endpoint of config.endpoints) {
      const sample = await request(config.origin, endpoint, agent, config.timeoutMs, signal);
      warmup.push(sample);
      if (!sample.ok) { stopReason = 'warmup_failed'; break; }
    }
    started = performance.now();
    const deadline = started + config.durationSeconds * 1000;
    let nextAt = started;
    if (stopReason !== 'warmup_failed') {
      while (!signal.aborted && sent + warmup.length < config.maxRequests && performance.now() < deadline && stopReason === 'duration') {
        if (running.size >= config.concurrency) { await Promise.race(running); continue; }
        const wait = Math.min(nextAt, deadline) - performance.now();
        if (wait > 0) await delay(wait, undefined, { signal }).catch(() => undefined);
        if (signal.aborted || performance.now() >= deadline || stopReason !== 'duration') break;
        const endpoint = config.endpoints[sent % config.endpoints.length];
        sent++;
        nextAt = performance.now() + 1000 / config.requestsPerSecond;
        const work = request(config.origin, endpoint, agent, config.timeoutMs, signal).then(sample => {
          samples.push(sample);
          consecutiveFailures = sample.ok ? 0 : consecutiveFailures + 1;
          if (sample.code === '429') stopReason = 'rate_limited';
          else if (consecutiveFailures >= 3 && stopReason !== 'rate_limited') stopReason = 'consecutive_errors';
        }).finally(() => running.delete(work));
        running.add(work);
      }
      if (signal.aborted) stopReason = 'interrupted';
      else if (sent + warmup.length >= config.maxRequests && stopReason === 'duration') stopReason = 'max_requests';
    }
    await Promise.all(running);
    const elapsedSeconds = (performance.now() - started) / 1000;
    return {
      schema: 1, mode: 'synthetic-local-read-only', startedAt, origin: config.origin,
      tlsVerification: tls ? (ca ? 'provided-ca' : 'system-ca') : 'http-loopback',
      config: { durationSeconds: config.durationSeconds, concurrency: config.concurrency, requestsPerSecond: config.requestsPerSecond, maxRequests: config.maxRequests, timeoutMs: config.timeoutMs },
      stopReason, sent, totalRequests: sent + warmup.length, elapsedSeconds: rounded(elapsedSeconds), throughputPerSecond: elapsedSeconds ? rounded(samples.length / elapsedSeconds) : 0,
      warmup: warmup.map(sample => ({ endpoint: ROUTES[sample.endpoint], code: sample.code, ok: sample.ok, ms: rounded(sample.ms) })),
      ...summarize(samples), endpoints: Object.fromEntries(config.endpoints.map(endpoint => [ROUTES[endpoint], summarize(samples.filter(sample => sample.endpoint === endpoint))])),
      interpretation: 'Это ограниченный замер на синтетических данных, а не предел производительности; малое число наблюдений не даёт устойчивый p99.',
    };
  } finally { agent.destroy(); }
}

async function main() {
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort());
  process.once('SIGTERM', () => controller.abort());
  try {
    const report = await measure(loadConfig(), controller.signal);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.failed || ['warmup_failed', 'interrupted'].includes(report.stopReason)) process.exitCode = 1;
  } catch (error) {
    const message = error.code ? `Не удалось подготовить замер: ${error.code}` : error.message;
    process.stderr.write(`${message}\n`); process.exitCode = 2;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
