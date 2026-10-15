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

import { execFile } from 'node:child_process';

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

/**
 * Automated self-healing Geetest v3 unban solver via ego-browser canvas pixel-diff + CDP mouse drag.
 * When verify.huodongxing.com/gt3 is triggered, solves the slider in ~4s and restores IP access.
 * @param {string} [verifyUrl]
 * @returns {Promise<boolean>}
 */
export async function autoUnbanGeetest(verifyUrl = 'https://www.huodongxing.com/events') {
  const target = verifyUrl && /^https?:\/\//i.test(verifyUrl)
    ? verifyUrl
    : 'https://www.huodongxing.com/events';

  const script = `
    const task = await taskSpace("hdx-auto-unban-" + Date.now());
    try {
      const page = task.page("p1");
      await page.goto(${JSON.stringify(target)}, { waitUntil: "domcontentloaded" });
      for (let attempt = 0; attempt < 2; attempt++) {
        for (let i = 0; i < 25; i++) {
          const state = await page.evaluate(() => {
            if (!location.hostname.includes("verify.huodongxing.com")) return "unbanned";
            const btn = document.querySelector("#unbanBtn");
            if (btn && !btn.classList.contains("loading")) btn.click();
            const bg = document.querySelector(".geetest_canvas_bg");
            return bg && bg.width > 0 ? "ready" : "waiting";
          });
          if (state === "unbanned") return;
          if (state === "ready") break;
          await page.waitForTimeout(300);
        }
        await page.waitForTimeout(500);
        const metrics = await page.evaluate(() => {
          const bg = document.querySelector(".geetest_canvas_bg");
          const full = document.querySelector(".geetest_canvas_fullbg");
          const slice = document.querySelector(".geetest_canvas_slice");
          const btnEl = document.querySelector(".geetest_slider_button");
          if (!bg || !full || !slice || !btnEl) return null;
          const w = bg.width, h = bg.height;
          const dBg = bg.getContext("2d").getImageData(0, 0, w, h).data;
          const dFull = full.getContext("2d").getImageData(0, 0, w, h).data;
          const dSlice = slice.getContext("2d").getImageData(0, 0, w, h).data;
          let sliceX = 0;
          for (let x = 0; x < w; x++) {
            let alpha = 0;
            for (let y = 0; y < h; y++) if (dSlice[(y * w + x) * 4 + 3] > 128) alpha++;
            if (alpha > 8) { sliceX = x; break; }
          }
          let gapX = -1;
          for (let x = sliceX + 30; x < w - 20; x++) {
            let diffPixels = 0;
            for (let y = 10; y < h - 10; y++) {
              const i = (y * w + x) * 4;
              const diff = Math.abs(dBg[i] - dFull[i]) + Math.abs(dBg[i+1] - dFull[i+1]) + Math.abs(dBg[i+2] - dFull[i+2]);
              if (diff > 90) diffPixels++;
            }
            if (diffPixels > 12) { gapX = x; break; }
          }
          const r = btnEl.getBoundingClientRect();
          return { distance: gapX - sliceX, startX: r.left + r.width / 2, startY: r.top + r.height / 2 };
        });
        if (metrics && metrics.distance > 0) {
          const { startX, startY, distance } = metrics;
          await page.cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: startX, y: startY });
          await page.cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: startX, y: startY, button: "left", clickCount: 1 });
          const steps = 26;
          for (let s = 1; s <= steps; s++) {
            const t = s / steps;
            const ease = 1 - Math.pow(1 - t, 3);
            const curX = startX + distance * ease;
            const curY = startY + (s % 2 === 0 ? 1 : -1);
            await page.waitForTimeout(20);
            await page.cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: curX, y: curY, button: "left", buttons: 1 });
          }
          await page.waitForTimeout(80);
          await page.cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: startX + distance, y: startY, button: "left", clickCount: 1 });
          await page.waitForTimeout(3000);
        }
        const unbanned = await page.evaluate(() => !location.hostname.includes("verify.huodongxing.com"));
        if (unbanned) break;
      }
    } finally {
      await task.finish({ keep: [] });
    }
  `;

  return new Promise((resolve) => {
    const child = execFile('ego-browser', ['nodejs', '-e', script], { timeout: 25000 }, (err) => {
      resolve(!err);
    });
    child.stdin?.end();
  });
}
