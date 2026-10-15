import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import net from 'node:net';

/**
 * Probes if a local TCP port is accepting connections within a short timeout.
 * @param {string} host
 * @param {number} port
 * @param {number} [timeoutMs=200]
 * @returns {Promise<boolean>}
 */
export function isPortOpen(host, port, timeoutMs = 200) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const cleanup = () => {
      if (!settled) {
        settled = true;
        socket.destroy();
      }
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      cleanup();
      resolve(true);
    });
    socket.once('timeout', () => {
      cleanup();
      resolve(false);
    });
    socket.once('error', () => {
      cleanup();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

/**
 * Resolves available HTTP proxy URL from environment or standard local Clash/V2Ray ports.
 * @returns {Promise<string|null>}
 */
export async function resolveAvailableProxy() {
  const envProxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY || process.env.all_proxy;
  if (envProxy) return envProxy;

  // Check standard local development proxies (Clash Verge / ClashMi: 7897, 7890)
  if (await isPortOpen('127.0.0.1', 7897)) {
    return 'http://127.0.0.1:7897';
  }
  if (await isPortOpen('127.0.0.1', 7890)) {
    return 'http://127.0.0.1:7890';
  }
  return null;
}

/**
 * Zero-dependency HTTPS fetch through an HTTP CONNECT proxy tunnel.
 * Compatible with the native fetch() interface.
 */
export function createProxyFetch(proxyUrlStr) {
  const proxyUrl = new URL(proxyUrlStr);

  return function proxyFetch(targetUrl, init = {}) {
    const url = new URL(targetUrl);
    const method = String(init.method || 'GET').toUpperCase();
    const headers = { ...init.headers, Host: url.hostname };

    return new Promise((resolve, reject) => {
      const connectReq = http.request({
        host: proxyUrl.hostname,
        port: Number(proxyUrl.port) || 80,
        method: 'CONNECT',
        path: `${url.hostname}:${url.port || 443}`,
      });

      connectReq.on('connect', (res, socket) => {
        let tlsSocket = null;
        try {
          if (res.statusCode !== 200) {
            socket.destroy();
            return reject(new Error(`Proxy CONNECT to ${url.hostname} failed with status ${res.statusCode}`));
          }

          tlsSocket = tls.connect({
            socket,
            servername: url.hostname,
          });

          const httpsReq = https.request({
            host: url.hostname,
            path: url.pathname + url.search,
            method,
            headers,
            createConnection: () => tlsSocket,
          }, (httpsRes) => {
            const chunks = [];
            httpsRes.on('data', (c) => chunks.push(c));
            httpsRes.on('end', () => {
              const bodyBuffer = Buffer.concat(chunks);
              const bodyText = bodyBuffer.toString('utf8');

              const responseObj = {
                status: httpsRes.statusCode,
                statusText: httpsRes.statusMessage || '',
                ok: httpsRes.statusCode >= 200 && httpsRes.statusCode < 300,
                url: targetUrl,
                headers: {
                  get(key) {
                    const val = httpsRes.headers[String(key).toLowerCase()];
                    if (Array.isArray(val)) return val.join('; ');
                    return typeof val === 'string' ? val : null;
                  },
                },
                text: () => Promise.resolve(bodyText),
                json: () => Promise.resolve(JSON.parse(bodyText)),
              };

              resolve(responseObj);
            });
          });

          httpsReq.on('error', (err) => {
            tlsSocket.destroy();
            reject(err);
          });

          if (init.body) {
            httpsReq.write(init.body);
          }
          httpsReq.end();
        } catch (err) {
          if (tlsSocket) tlsSocket.destroy();
          socket.destroy();
          reject(err);
        }
      });

      connectReq.on('error', (err) => {
        reject(err);
      });

      connectReq.end();
    });
  };
}

/**
 * Smart resilient fetch: uses proxy if available/configured, falls back to native fetch.
 */
let cachedProxyFetch = null;
let proxyChecked = false;

export async function resilientFetch(targetUrl, init = {}) {
  if (!proxyChecked) {
    proxyChecked = true;
    const proxy = await resolveAvailableProxy();
    if (proxy) {
      cachedProxyFetch = createProxyFetch(proxy);
    }
  }

  if (cachedProxyFetch) {
    try {
      return await cachedProxyFetch(targetUrl, init);
    } catch {
      // Fallback to native fetch on tunnel error
      return globalThis.fetch(targetUrl, init);
    }
  }

  return globalThis.fetch(targetUrl, init);
}
