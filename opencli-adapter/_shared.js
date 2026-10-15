import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const localSrcUrl = new URL('../src/index.js', import.meta.url);
const coreModule = fs.existsSync(fileURLToPath(localSrcUrl))
  ? await import(localSrcUrl.href)
  : await import('huodongxing-cli');

const {
  parsers,
  assertSafeRoute,
  RequestPacer,
  classifySample,
  resolveRuntimeConfig,
  checkUpstreamOpencliOwnerFix,
  classifyEventDomains,
  extractTechSignals,
  buildEcosystemDigestMarkdown,
} = coreModule;

const sharedPacer = new RequestPacer(900);

/**
 * Fetches an HTML/AJAX endpoint from inside the active Huodongxing browser page (`page.evaluate`)
 * while enforcing the pre-socket Security Route Denylist and WAF RequestPacer.
 */
export async function fetchPageHtml(page, pathOrUrl, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  assertSafeRoute(method, pathOrUrl);

  return sharedPacer.schedule(async () => {
    const currentUrl = await page.evaluate('window.location.href').catch(() => '');
    if (!String(currentUrl).includes('huodongxing.com')) {
      await page.goto('https://www.huodongxing.com/user/index');
      await page.wait(1.5);
    }

    const headers = options.headers || {};
    const body = options.body ?? null;
    const script = `(async () => {
      const res = await fetch(${JSON.stringify(pathOrUrl)}, {
        method: ${JSON.stringify(method)},
        credentials: 'include',
        redirect: 'manual',
        headers: ${JSON.stringify(headers)},
        body: ${body != null ? JSON.stringify(body) : 'undefined'}
      });
      if (res.type === 'opaqueredirect' || res.status === 301 || res.status === 302) {
        return { status: res.status || 302, redirected: true, html: '' };
      }
      const html = await res.text();
      return { status: res.status, redirected: false, url: res.url, html };
    })()`;

    const raw = await page.evaluate(script);
    const payload = raw && typeof raw === 'object' && 'data' in raw && 'session' in raw ? raw.data : raw;
    if (!payload || typeof payload !== 'object') {
      throw new Error(`Empty response from browser fetch for ${pathOrUrl}`);
    }
    const waf = parsers.detectWafOrErrorHtml(payload.html || '');
    if (waf.blocked) {
      throw new Error(`${waf.code}: ${waf.message}`);
    }
    return payload.html || '';
  });
}

export {
  parsers,
  classifySample,
  resolveRuntimeConfig,
  checkUpstreamOpencliOwnerFix,
  classifyEventDomains,
  extractTechSignals,
  buildEcosystemDigestMarkdown,
};

