import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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
import { autoUnbanGeetest } from './tunnel-fetch.js';

const execFileAsync = promisify(execFile);

/**
 * OpenCLI Browser Bridge Client for Huodongxing (活动行).
 * Executes in-origin fetch() inside the bound Chrome tab (`opencli browser <session> eval`)
 * to inherit HDXWAFID + AccupassWeb session cookies with <150ms latency and zero CAPTCHA friction.
 */
export class OpenCliClient {
  /**
   * @param {Object} [options={}]
   * @param {string} [options.session='work'] - OpenCLI browser session name
   * @param {string} [options.opencliBin='opencli'] - Path to opencli binary
   * @param {number} [options.minIntervalMs=900] - Minimum interval between requests
   * @param {number} [options.timeoutMs=25000] - Subprocess timeout
   */
  constructor(options = {}) {
    this.session = options.session || process.env.HDX_BROWSER_SESSION || 'work';
    this.opencliBin = options.opencliBin || process.env.OPENCLI_BIN || 'opencli';
    this.timeoutMs = Number(options.timeoutMs || 25000);
    this.pacer = options.pacer instanceof RequestPacer
      ? options.pacer
      : new RequestPacer(options.minIntervalMs ?? process.env.HDX_MIN_INTERVAL_MS ?? 900);
  }

  /**
   * Executes arbitrary JS expression inside the bound OpenCLI browser session.
   * @param {string} expression
   */
  async evalInBrowser(expression) {
    const { stdout } = await execFileAsync(
      this.opencliBin,
      ['browser', this.session, 'eval', expression],
      { timeout: this.timeoutMs, maxBuffer: 16 * 1024 * 1024 },
    );
    const trimmed = String(stdout || '').trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }

  /**
   * Probes whether the OpenCLI browser session is active and bound to huodongxing.com.
   */
  async checkSessionStatus() {
    try {
      const info = await this.evalInBrowser(
        '({ href: location.href, origin: location.origin, title: document.title, hasCookies: (() => { try { return Boolean(document.cookie && (document.cookie.includes("HDXWAFID") || document.cookie.includes("uid"))); } catch { return false; } })() })',
      );
      const onDomain = Boolean(info && typeof info.origin === 'string' && info.origin.includes('huodongxing.com'));
      return {
        available: Boolean(info && typeof info === 'object'),
        onDomain,
        session: this.session,
        href: info?.href || '',
        title: info?.title || '',
        hasCookies: Boolean(info?.hasCookies),
      };
    } catch (err) {
      return {
        available: false,
        onDomain: false,
        session: this.session,
        error: err.message,
      };
    }
  }

  /**
   * Extracts active document.cookie from the bound browser tab to bootstrap Direct HTTP mode.
   */
  async extractBrowserCookies() {
    const status = await this.checkSessionStatus();
    if (!status.available || !status.onDomain) return '';
    try {
      const cookieStr = await this.evalInBrowser('(() => { try { return document.cookie || ""; } catch { return ""; } })()');
      return typeof cookieStr === 'string' ? cookieStr : '';
    } catch {
      return '';
    }
  }

  /**
   * Performs a paced in-origin fetch() inside the bound browser session after passing Security Guard.
   * @param {string} pathOrUrl
   * @param {Object} [options={}]
   */
  async fetchHtml(pathOrUrl, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    assertSafeRoute(method, pathOrUrl);

    return this.pacer.schedule(async () => {
      const status = await this.checkSessionStatus();
      if (!status.available) {
        throw new Error(`OpenCLI browser session '${this.session}' is not reachable: ${status.error || 'unbound'}`);
      }
      if (!status.onDomain) {
        await execFileAsync(
          this.opencliBin,
          ['browser', this.session, 'open', 'https://www.huodongxing.com/user/index'],
          { timeout: this.timeoutMs },
        );
      }

      const headers = options.headers || {};
      const body = options.body ?? null;
      const script = `(async () => {
        try {
          document.cookie = 'HDXWAFID=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.huodongxing.com';
          document.cookie = 'HDXWAFID=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
        } catch {}
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

      let result = await this.evalInBrowser(script);
      if (!result || typeof result !== 'object') {
        throw new Error(`Empty response from OpenCLI browser fetch for ${pathOrUrl}`);
      }
      if (result.redirected && result.status === 302 && !(method === 'POST' && String(pathOrUrl).includes('/profile'))) {
        // Self-healing Geetest v3 unban via ego-browser + retry
        await autoUnbanGeetest('https://www.huodongxing.com/events');
        result = await this.evalInBrowser(script);
      }
      if (result.redirected && result.status === 302) {
        // For POST /profile, a 302 redirect back to /account/profile indicates success!
        if (method === 'POST' && String(pathOrUrl).includes('/profile')) {
          return result;
        }
        throw new Error(
          `Request to ${pathOrUrl} returned redirect (${result.status}). Session may require login or hit OpenResty WAF rate-limit.`,
        );
      }
      const waf = detectWafOrErrorHtml(result.html);
      if (waf.blocked) {
        throw new Error(`${waf.code}: ${waf.message}`);
      }
      return result;
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

  async getProfile(options = {}) {
    if (
      !options.forceRefresh &&
      this._cachedProfile &&
      Date.now() - this._cachedProfileAt < 5000
    ) {
      return this._cachedProfile;
    }
    const res = await this.fetchHtml('/account/profile');
    const parsed = parseProfileHtml(res.html);
    if (parsed && parsed.account) {
      this._cachedProfile = parsed;
      this._cachedProfileAt = Date.now();
    }
    return parsed;
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

  /**
   * Reversible profile mutation (`POST /profile`) with `--dry-run` preview and post-write re-read verification.
   */
  async updateProfile(changes = {}, options = {}) {
    const dryRun = options.dryRun !== false;
    const before = await this.getProfile();
    if (!before.account) {
      throw new Error('Cannot update profile: active session is not authenticated on /account/profile.');
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

    // Authoritative re-read from server (SSOT unidirectional data flow)
    const after = await this.getProfile({ forceRefresh: true });
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

  /**
   * Validates and prepares an event registration payload (`--dry-run` default to prevent junk attendee orders).
   */
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
