import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION, PACKAGE_NAME, LICENSE } from './version.js';
import {
  resolveRuntimeConfig,
  updateOperatorConfig,
  checkUpstreamOpencliOwnerFix,
  classifySample,
  runDiagnosticReconcile,
} from './diagnose.js';
import {
  listWatchlist,
  upsertWatchlistItem,
  updateWatchlistItem,
  deleteWatchlistItem,
  exportWatchlistIcs,
} from './watchlist-store.js';
import { generateEventsIcs } from './ics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      if (tooLarge) return;
      total += chunk.length;
      if (total > 1024 * 1024) {
        tooLarge = true;
        const err = new Error('Request body too large (exceeds 1MB limit)');
        err.statusCode = 413;
        err.code = 'PAYLOAD_TOO_LARGE';
        req.resume();
        reject(err);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) return;
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        const err = new Error('Invalid JSON request payload');
        err.statusCode = 400;
        err.code = 'INVALID_JSON';
        reject(err);
      }
    });
    req.on('error', (err) => {
      if (!tooLarge) reject(err);
    });
  });
}

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function sendIcs(res, filename, icsContent) {
  res.writeHead(200, {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  });
  res.end(icsContent);
}

/**
 * Creates the Huodongxing Regional Intelligence & Diagnostic Console HTTP Server.
 * @param {Object} options
 * @param {import('./index.js').HuodongxingClient} options.client
 */
export function createConsoleServer(options = {}) {
  const client = options.client;
  if (!client) {
    throw new Error('createConsoleServer requires a HuodongxingClient instance');
  }

  const sseClients = new Set();
  const apiCache = new Map();
  const CACHE_TTL_MS = Number(options.cacheTtlMs ?? 120000);

  function broadcastSse(event, data) {
    const frame = `event: ${event}\ndata: ${JSON.stringify({
      ...data,
      timestamp: new Date().toISOString(),
    })}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(frame);
      } catch {
        sseClients.delete(res);
      }
    }
  }

  async function cachedCall(key, forceRefresh, fetcher) {
    if (!forceRefresh && CACHE_TTL_MS > 0 && apiCache.has(key)) {
      const entry = apiCache.get(key);
      if (Date.now() - entry.ts < CACHE_TTL_MS) {
        return { ...entry.data, cached: true, cachedAt: new Date(entry.ts).toISOString() };
      }
    }
    const fresh = await fetcher();
    const stamped = { ...fresh, cached: false, fetchedAt: new Date().toISOString() };
    apiCache.set(key, { ts: Date.now(), data: stamped });
    return stamped;
  }

  function refreshClientConfig() {
    client.configState = resolveRuntimeConfig();
    if (client.sharedPacer) {
      client.sharedPacer.minIntervalMs = Math.max(
        0,
        Number(client.configState.effective.minIntervalMs ?? 900)
      );
    }
  }

  const server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
      const pathname = parsedUrl.pathname;
      const query = Object.fromEntries(parsedUrl.searchParams.entries());
      const method = (req.method || 'GET').toUpperCase();

      // 1. Real-Time SSE Push Stream
      if (method === 'GET' && pathname === '/api/stream') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        });
        res.write(
          `event: connected\ndata: ${JSON.stringify({
            ok: true,
            version: VERSION,
            timestamp: new Date().toISOString(),
          })}\n\n`
        );
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
      }

      // 2. Health Probe
      if (method === 'GET' && pathname === '/api/health') {
        refreshClientConfig();
        const wl = listWatchlist({ status: 'all' });
        return sendJson(res, 200, {
          ok: true,
          package: PACKAGE_NAME,
          version: VERSION,
          license: LICENSE,
          engine: client.engine,
          effectiveConfig: client.configState.effective,
          watchlistCounts: wl.counts,
          sseConnectedClients: sseClients.size,
          timestamp: new Date().toISOString(),
        });
      }

      // 3. Regional Recommendations (/api/recommend & /api/recommend/ics)
      if (method === 'GET' && (pathname === '/api/recommend' || pathname === '/api/recommend/ics')) {
        refreshClientConfig();
        const eff = client.configState.effective;
        const recOpts = {
          region: query.region ?? '',
          cities: query.cities ?? '',
          city: query.city ?? '',
          keywords: query.keywords ?? query.keyword ?? '',
          queryKeyword: query.queryKeyword ?? '',
          tag: query.tag ?? '',
          upcomingOnly: query.upcomingOnly !== 'false' && query.upcomingOnly !== '0',
          limit: Number(query.limit || 24),
          perCityLimit: Number(query.perCityLimit || 10),
        };
        const cacheKey = `rec:${JSON.stringify({
          recOpts,
          defaultCities: eff.defaultCities,
          defaultRegion: eff.defaultRegion,
          defaultKeywords: eff.defaultKeywords,
        })}`;
        const forceRefresh = query.refresh === '1' || query.refresh === 'true';
        const data = await cachedCall(cacheKey, forceRefresh, () => client.recommendEvents(recOpts));

        if (pathname === '/api/recommend/ics') {
          const ics = generateEventsIcs(data.items || [], {
            calendarName: `活动行推荐 (${(data.region?.cities || []).join('·')})`,
          });
          return sendIcs(res, 'hdx-regional-recommendations.ics', ics);
        }

        return sendJson(res, 200, { ok: true, ...data });
      }

      // 4. Public Events Search (/api/events)
      if (method === 'GET' && pathname === '/api/events') {
        refreshClientConfig();
        const searchOpts = {
          keyword: query.keyword || query.qs || '',
          city: query.city || '',
          cities: query.cities || '',
          region: query.region || '',
          tag: query.tag || '',
          eventType: query.eventType || '',
          date: query.date || '',
          dateTo: query.dateTo || '',
          upcomingOnly: query.upcomingOnly === 'true' || query.upcomingOnly === '1',
          limit: Number(query.limit || 20),
        };
        const forceRefresh = query.refresh === '1' || query.refresh === 'true';
        const cacheKey = `events:${JSON.stringify(searchOpts)}`;
        const data = await cachedCall(cacheKey, forceRefresh, () => client.searchEvents(searchOpts));
        return sendJson(res, 200, { ok: true, ...data });
      }

      // 5. Event Detail & Single-Event iCal Download (/api/event/:id & /api/event/:id/ics)
      const eventMatch = pathname.match(/^\/api\/event\/(\d{6,20})(\/ics)?$/);
      if (method === 'GET' && eventMatch) {
        const eventId = eventMatch[1];
        const isIcs = Boolean(eventMatch[2]);
        const forceRefresh = query.refresh === '1' || query.refresh === 'true';
        const detail = await cachedCall(`detail:${eventId}`, forceRefresh, () =>
          client.getEventDetail(eventId)
        );
        if (isIcs) {
          const ics = generateEventsIcs(
            [
              {
                id: detail.id || eventId,
                title: detail.title || `活动 ${eventId}`,
                startTime: detail.startTime,
                endTime: detail.endTime,
                address: `${detail.city || ''} ${detail.address || ''}`.trim(),
                organizer: detail.organizers?.[0]?.name || '',
                url: detail.url || `https://www.huodongxing.com/event/${eventId}`,
              },
            ],
            { calendarName: detail.title || `Huodongxing Event ${eventId}` }
          );
          return sendIcs(res, `hdx-event-${eventId}.ics`, ics);
        }
        return sendJson(res, 200, { ok: true, ...detail });
      }

      // 6. Explore Surfaces: Ranklist, Topics, Organizers
      if (method === 'GET' && pathname === '/api/ranklist') {
        const limit = Number(query.limit || 15);
        const forceRefresh = query.refresh === '1';
        const data = await cachedCall(`ranklist:${limit}`, forceRefresh, () =>
          client.getRanklist({ limit })
        );
        return sendJson(res, 200, { ok: true, ...data });
      }

      if (method === 'GET' && pathname === '/api/topics') {
        const limit = Number(query.limit || 12);
        const forceRefresh = query.refresh === '1';
        const data = await cachedCall(`topics:${limit}`, forceRefresh, () =>
          client.getTopics({ limit })
        );
        return sendJson(res, 200, { ok: true, ...data });
      }

      if (method === 'GET' && pathname === '/api/organizers') {
        const limit = Number(query.limit || 12);
        const tag = query.tag || '';
        const forceRefresh = query.refresh === '1';
        const data = await cachedCall(`organizers:${tag}:${limit}`, forceRefresh, () =>
          client.getOrganizers({ tag, limit })
        );
        return sendJson(res, 200, { ok: true, ...data });
      }

      // 6b. Multi-Domain Ecosystem Digest (/api/digest)
      if (method === 'GET' && pathname === '/api/digest') {
        refreshClientConfig();
        const digestOpts = {
          city: query.city || undefined,
          cities: query.cities || undefined,
          region: query.region || undefined,
          onlineOnly: query.onlineOnly === 'true' || query.onlineOnly === '1',
          upcomingOnly: query.upcomingOnly !== 'false' && query.upcomingOnly !== '0',
          limit: Number(query.limit || 24),
        };
        const forceRefresh = query.refresh === '1' || query.refresh === 'true';
        const cacheKey = `digest:${JSON.stringify(digestOpts)}`;
        const data = await cachedCall(cacheKey, forceRefresh, () =>
          client.ecosystemDigest(digestOpts)
        );
        return sendJson(res, 200, { ok: true, ...data });
      }

      // 7. Persistent Watchlist CRUD & iCal Export (/api/watchlist*)
      if (method === 'GET' && pathname === '/api/watchlist/ics') {
        const { ics } = exportWatchlistIcs(query);
        return sendIcs(res, 'hdx-watchlist.ics', ics);
      }

      if (method === 'GET' && pathname === '/api/watchlist') {
        const wl = listWatchlist(query);
        return sendJson(res, 200, { ok: true, ...wl });
      }

      if (method === 'POST' && pathname === '/api/watchlist') {
        const body = await readJsonBody(req);
        const result = upsertWatchlistItem(body);
        broadcastSse('watchlist_updated', {
          action: result.action,
          itemId: result.item.id,
          counts: result.watchlist.counts,
        });
        return sendJson(res, result.action === 'created' ? 201 : 200, {
          ok: true,
          ...result,
        });
      }

      const wlItemMatch = pathname.match(/^\/api\/watchlist\/([^/]+)$/);
      if (wlItemMatch) {
        const itemId = decodeURIComponent(wlItemMatch[1]);
        if (method === 'PATCH' || method === 'PUT') {
          const body = await readJsonBody(req);
          const result = updateWatchlistItem(itemId, body);
          broadcastSse('watchlist_updated', {
            action: 'updated',
            itemId: result.item.id,
            counts: result.watchlist.counts,
          });
          return sendJson(res, 200, { ok: true, ...result });
        }
        if (method === 'DELETE') {
          const result = deleteWatchlistItem(itemId);
          broadcastSse('watchlist_updated', {
            action: 'deleted',
            itemId,
            counts: result.watchlist.counts,
          });
          return sendJson(res, 200, { ok: true, ...result });
        }
      }

      // 8. Diagnostic & Observability Center (能读 / 能试 / 能调)
      if (method === 'GET' && (pathname === '/api/diagnose/config' || pathname === '/api/config')) {
        refreshClientConfig();
        const configState = resolveRuntimeConfig();
        const upstreamOpencliFix = checkUpstreamOpencliOwnerFix();
        return sendJson(res, 200, {
          ok: true,
          configState,
          upstreamOpencliFix,
        });
      }

      if ((method === 'POST' || method === 'PUT') && (pathname === '/api/diagnose/config' || pathname === '/api/config')) {
        const body = await readJsonBody(req);
        const reset = Boolean(body.reset);
        const updates = body.updates || {};
        if (!reset && (!updates || Object.keys(updates).length === 0)) {
          return sendJson(res, 400, {
            ok: false,
            code: 'VALIDATION_ERROR',
            error: '请提供至少一项要更新的配置参数 (updates)',
          });
        }
        const configState = updateOperatorConfig(updates, { reset });
        apiCache.clear();
        refreshClientConfig();
        const upstreamOpencliFix = checkUpstreamOpencliOwnerFix();
        broadcastSse('config_updated', {
          reset,
          effective: configState.effective,
          sources: configState.sources,
        });
        return sendJson(res, 200, {
          ok: true,
          reset,
          configState,
          upstreamOpencliFix,
        });
      }

      if (method === 'POST' && pathname === '/api/diagnose/sample') {
        const body = await readJsonBody(req);
        const sample = String(body.sample ?? '').trim();
        if (!sample) {
          return sendJson(res, 400, {
            ok: false,
            code: 'VALIDATION_ERROR',
            error: '请输入要测试的样本链接、活动 ID 或城市/区域名称',
          });
        }
        const verdict = classifySample(sample, {
          method: body.method || 'GET',
        });
        return sendJson(res, 200, {
          ok: true,
          result: verdict,
        });
      }

      if (method === 'POST' && pathname === '/api/diagnose/reconcile') {
        const body = await readJsonBody(req);
        const offline = body.offline !== false;
        const report = await runDiagnosticReconcile(client, { offline });
        broadcastSse('diagnostic_ran', { ok: report.ok });
        return sendJson(res, 200, {
          ok: true,
          report,
        });
      }

      if (pathname.startsWith('/api/')) {
        return sendJson(res, 404, {
          ok: false,
          code: 'ROUTE_NOT_FOUND',
          error: `Unknown API route: ${method} ${pathname}`,
        });
      }

      // 9. Serve Static Files from public/
      const relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const safePath = path.normalize(path.join(PUBLIC_DIR, relPath));
      if (!safePath.startsWith(PUBLIC_DIR) || !fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
        return sendJson(res, 404, {
          ok: false,
          code: 'ASSET_NOT_FOUND',
          error: `Static asset not found: ${pathname}`,
        });
      }

      const ext = path.extname(safePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
      });
      res.end(fs.readFileSync(safePath));
    } catch (err) {
      const status = err.statusCode || 500;
      sendJson(res, status, {
        ok: false,
        code: err.code || 'SERVER_ERROR',
        error: err.message || 'Internal server error',
      });
    }
  });

  return {
    server,
    broadcastSse,
    clearCache: () => apiCache.clear(),
    listen: (port = 4173, host = '127.0.0.1') =>
      new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          const addr = server.address();
          const actualPort = typeof addr === 'object' && addr ? addr.port : port;
          resolve({
            host,
            port: actualPort,
            url: `http://${host}:${actualPort}`,
          });
        });
      }),
    close: () =>
      new Promise((resolve) => {
        for (const res of sseClients) {
          try {
            res.end();
          } catch {
            // ignore
          }
        }
        sseClients.clear();
        server.close(() => resolve());
      }),
  };
}
