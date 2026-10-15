import { assertSafeRoute, RequestPacer } from './security-guard.js';
import {
  buildEventsUrl,
  detectWafOrErrorHtml,
  parseConsoleEventsHtml,
  parseConsoleHomeHtml,
  parseEventDetailHtml,
  parseEventsHtml,
  parseFavoritesHtml,
  parseFollowingHtml,
  parseOrganizersHtml,
  parseProfileHtml,
  parseRanklistHtml,
  parseTicketDetailHtml,
  parseTicketsHtml,
  parseTimelineHtml,
  parseTopicsHtml,
  parseUserStateHtml,
} from './parsers.js';
import { resilientFetch } from './tunnel-fetch.js';

const DEFAULT_BASE_URL = 'https://www.huodongxing.com';
const DEFAULT_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

/**
 * Sanitizes a Cookie header string so non-ASCII values (such as unencoded Chinese city cookies
 * from document.cookie) are URI-encoded and never trigger Node's ERR_INVALID_CHAR.
 * @param {string} cookieStr
 * @returns {string}
 */
export function sanitizeCookieHeader(cookieStr) {
  return String(cookieStr || '')
    .replace(/[\r\n]+/g, '; ')
    .split(';')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const eqIdx = pair.indexOf('=');
      if (eqIdx === -1) return pair.replace(/[^\x20-\x7E]/g, '');
      const k = pair.slice(0, eqIdx).trim().replace(/[^\x20-\x7E]/g, '');
      const v = pair.slice(eqIdx + 1).trim();
      const safeV = /[^\x20-\x7E]/.test(v) ? encodeURIComponent(v) : v;
      return k ? `${k}=${safeV}` : '';
    })
    .filter(Boolean)
    .join('; ');
}

/**
 * Direct HTTP Client for Huodongxing (活动行).
 * Uses Node native fetch with RequestPacer, pre-socket Security Guard, and manual redirect
 * inspection to detect OpenResty WAF redirects (verify.huodongxing.com/gt3) cleanly.
 */
export class DirectClient {
  /**
   * @param {Object} [options={}]
   * @param {string} [options.baseUrl]
   * @param {string} [options.cookie]
   * @param {number} [options.minIntervalMs=900]
   * @param {Function} [options.fetchImpl]
   */
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || process.env.HDX_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.cookie = sanitizeCookieHeader(options.cookie ?? process.env.HDX_COOKIE ?? '');
    this.userAgent = options.userAgent || process.env.HDX_USER_AGENT || DEFAULT_UA;
    this.fetchImpl = options.fetchImpl || resilientFetch;
    this.pacer = options.pacer instanceof RequestPacer
      ? options.pacer
      : new RequestPacer(options.minIntervalMs ?? process.env.HDX_MIN_INTERVAL_MS ?? 900);
  }

  setCookie(cookieStr) {
    this.cookie = sanitizeCookieHeader(cookieStr);
  }

  hasCookie() {
    return Boolean(this.cookie && this.cookie.trim().length > 0);
  }

  /**
   * Performs a paced HTTP request after passing pre-socket Security Guard.
   * @param {string} pathOrUrl
   * @param {Object} [options={}]
   */
  async fetchHtml(pathOrUrl, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    assertSafeRoute(method, pathOrUrl);

    const url = /^https?:\/\//i.test(pathOrUrl)
      ? pathOrUrl
      : `${this.baseUrl}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;

    return this.pacer.schedule(async () => {
      const headers = {
        'User-Agent': this.userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Referer: `${this.baseUrl}/`,
        ...(options.headers || {}),
      };
      if (this.cookie) {
        headers.Cookie = sanitizeCookieHeader(this.cookie);
      }

      const res = await this.fetchImpl(url, {
        method,
        headers,
        body: options.body ?? undefined,
        redirect: 'manual',
      });

      // Capture Set-Cookie if HDXWAFID is issued
      const rawSetCookie = res.headers?.get?.('set-cookie');
      const setCookie = Array.isArray(rawSetCookie) ? rawSetCookie.join('; ') : String(rawSetCookie || '');
      if (!this.cookie && setCookie) {
        const wafMatch = setCookie.match(/HDXWAFID=[^;\r\n]+/);
        if (wafMatch) this.cookie = sanitizeCookieHeader(wafMatch[0]);
      }

      const location = res.headers?.get?.('location') || '';
      if (res.status === 301 || res.status === 302) {
        if (/verify\.huodongxing\.com\/gt3/i.test(location)) {
          const err = new Error(
            `WAF_RATE_LIMIT: Direct HTTP request to ${pathOrUrl} redirected to Geetest WAF (${location}). Use OpenCLI browser session or provide HDXWAFID+AccupassWeb cookies.`,
          );
          err.code = 'WAF_RATE_LIMIT';
          throw err;
        }
        if (/\/login/i.test(location)) {
          const err = new Error(`AUTH_REQUIRED: Route ${pathOrUrl} redirected to login (${location}).`);
          err.code = 'AUTH_REQUIRED';
          throw err;
        }
        if (method === 'POST' && String(pathOrUrl).includes('/profile')) {
          return { status: res.status, redirected: true, location, html: '' };
        }
      }

      const html = await res.text();
      const waf = detectWafOrErrorHtml(html);
      if (waf.blocked) {
        const err = new Error(`${waf.code}: ${waf.message}`);
        err.code = waf.code;
        throw err;
      }

      return {
        status: res.status,
        redirected: false,
        location,
        url,
        html,
      };
    });
  }

  async searchEvents(args = {}) {
    const url = buildEventsUrl(args);
    const relativePath = url.replace(/^https?:\/\/[^/]+/i, '');
    const res = await this.fetchHtml(relativePath);
    return parseEventsHtml(res.html, args);
  }

  async getEventDetail(eventId) {
    const cleanId = String(eventId || '').replace(/\D/g, '');
    if (!cleanId) throw new Error('Event ID is required');
    const res = await this.fetchHtml(`/event/${cleanId}`);
    return parseEventDetailHtml(res.html, cleanId);
  }

  async getUserState() {
    const res = await this.fetchHtml('/user/index');
    return parseUserStateHtml(res.html);
  }

  async getTimeline(options = {}) {
    const page = Number(options.page || 1);
    const limit = Number(options.limit || 20);
    const path = page > 1
      ? `/user/followandregevents?page=${page}&pagesize=${Math.min(limit, 50)}`
      : '/user/index';
    const res = await this.fetchHtml(path, {
      headers: page > 1 ? { 'X-Requested-With': 'XMLHttpRequest' } : {},
    });
    return parseTimelineHtml(res.html, limit);
  }

  async getTickets(options = {}) {
    const res = await this.fetchHtml('/user/regevents');
    return parseTicketsHtml(res.html, options);
  }

  async getTicketDetail(tid) {
    const cleanTid = String(tid || '').replace(/\D/g, '');
    if (!cleanTid) throw new Error('Ticket ID (tid) is required');
    const res = await this.fetchHtml(`/user/tikcets?tids=${cleanTid}`);
    return parseTicketDetailHtml(res.html, cleanTid);
  }

  async getFavorites(options = {}) {
    const res = await this.fetchHtml('/user/userfollows');
    return parseFavoritesHtml(res.html, Number(options.limit || 50));
  }

  async getFollowing(options = {}) {
    const res = await this.fetchHtml('/user/userfollows');
    return parseFollowingHtml(res.html, options);
  }

  async getProfile() {
    const res = await this.fetchHtml('/account/profile');
    return parseProfileHtml(res.html);
  }

  async getOrganizers(options = {}) {
    const tag = options.tag ? `?tag=${encodeURIComponent(options.tag)}` : '';
    const res = await this.fetchHtml(`/zhubanfang${tag}`);
    return parseOrganizersHtml(res.html, Number(options.limit || 20));
  }

  async getRanklist(options = {}) {
    const res = await this.fetchHtml('/ranklist');
    return parseRanklistHtml(res.html, Number(options.limit || 20));
  }

  async getTopics(options = {}) {
    const res = await this.fetchHtml('/topic');
    return parseTopicsHtml(res.html, Number(options.limit || 20));
  }

  async getConsoleHome() {
    const res = await this.fetchHtml('/console/home');
    return parseConsoleHomeHtml(res.html);
  }

  async getConsoleEvents(options = {}) {
    const res = await this.fetchHtml('/console/eventadmin');
    const statusMap = {
      all: -3,
      published: 1,
      reviewing: 5,
      ended: 4,
      draft: 0,
      offline: 11,
      cancelled: 3,
    };
    const statusKey = String(options.status || 'all').toLowerCase();
    const statusCode = statusMap[statusKey] ?? (Number.isInteger(Number(options.status)) ? Number(options.status) : -3);

    const form = new URLSearchParams({
      page: String(options.page || 1),
      size: String(options.limit || 10),
      status: String(statusCode),
      keywords: String(options.keyword || ''),
      order: '0',
    });

    let ajaxHtml = '';
    try {
      const ajaxRes = await this.fetchHtml('/console/userpubevents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: form.toString(),
      });
      ajaxHtml = ajaxRes.html || '';
    } catch {
      ajaxHtml = '';
    }

    return parseConsoleEventsHtml(res.html, ajaxHtml);
  }

  async updateProfile(changes = {}, options = {}) {
    const dryRun = options.dryRun !== false;
    const before = await this.getProfile();
    if (!before.account) {
      throw new Error('Cannot update profile: DirectClient lacks valid authenticated session cookies.');
    }

    const nextFields = { ...before.rawFormFields };
    if (changes.brief !== undefined) nextFields.Brief = String(changes.brief);
    if (changes.nick !== undefined) nextFields.Nick = String(changes.nick);
    if (changes.realName !== undefined) nextFields.RealName = String(changes.realName);

    const diff = {};
    for (const key of ['Brief', 'Nick', 'RealName']) {
      if (before.rawFormFields[key] !== nextFields[key]) {
        diff[key] = { from: before.rawFormFields[key] ?? '', to: nextFields[key] ?? '' };
      }
    }

    if (dryRun) {
      return {
        dryRun: true,
        mutated: false,
        verified: true,
        account: before.account,
        before: {
          nick: before.nick,
          realName: before.realName,
          brief: before.brief,
        },
        proposed: {
          nick: nextFields.Nick,
          realName: nextFields.RealName,
          brief: nextFields.Brief,
        },
        diff,
      };
    }

    const bodyParams = new URLSearchParams();
    for (const [k, v] of Object.entries(nextFields)) {
      bodyParams.set(k, String(v ?? ''));
    }

    await this.fetchHtml('/profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyParams.toString(),
    });

    const after = await this.getProfile();
    const verified = (
      (changes.brief === undefined || after.brief === String(changes.brief))
      && (changes.nick === undefined || after.nick === String(changes.nick))
    );

    return {
      dryRun: false,
      mutated: true,
      verified,
      account: after.account,
      before: {
        nick: before.nick,
        realName: before.realName,
        brief: before.brief,
      },
      after: {
        nick: after.nick,
        realName: after.realName,
        brief: after.brief,
      },
      diff,
    };
  }

  async registerEvent(eventId, payload = {}, options = {}) {
    const dryRun = options.dryRun !== false;
    const detail = await this.getEventDetail(eventId);
    const ticketSn = Number(payload.ticketSn || detail.tickets[0]?.sn || 1);
    const selectedTicket = detail.tickets.find((t) => Number(t.sn) === ticketSn) || detail.tickets[0] || null;

    const missingRequiredFields = detail.formItems
      .filter((f) => f.required && !(f.key in (payload.fields || {})) && !(f.title in (payload.fields || {})))
      .map((f) => ({ key: f.key, title: f.title, type: f.type }));

    return {
      dryRun,
      eventId: detail.id,
      eventTitle: detail.title,
      selectedTicket,
      registrationTokenPresent: detail.registrationToken.present,
      requiredFormItemsCount: detail.formItems.filter((f) => f.required).length,
      missingRequiredFields,
      readyToSubmit: Boolean(selectedTicket && selectedTicket.enabled && missingRequiredFields.length === 0),
    };
  }
}
