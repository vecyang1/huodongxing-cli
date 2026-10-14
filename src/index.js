import { VERSION, PACKAGE_NAME, LICENSE, DESCRIPTION } from './version.js';
import {
  SecurityRouteDeniedError,
  SECURITY_ROUTE_DENYLIST,
  assertSafeRoute,
  inspectRouteSafety,
  assertSafeCliAction,
  RequestPacer,
} from './security-guard.js';
import * as parsers from './parsers.js';
import { generateTicketsIcs, generateEventsIcs, parseTicketDateRange } from './ics.js';
import { DirectClient } from './direct-client.js';
import { OpenCliClient } from './opencli-client.js';
import {
  getConfigOverrideFile,
  resolveRuntimeConfig,
  updateOperatorConfig,
  checkUpstreamOpencliOwnerFix,
  classifySample,
  runDiagnosticReconcile,
} from './diagnose.js';
import {
  getWatchlistFile,
  extractCanonicalEventId,
  listWatchlist,
  upsertWatchlistItem,
  updateWatchlistItem,
  deleteWatchlistItem,
  exportWatchlistIcs,
} from './watchlist-store.js';
import { createConsoleServer } from './server.js';
import { formatOutput, toCsv, toMarkdownTable, toTerminalTable } from './formatters.js';

/**
 * Dual-Engine Huodongxing (活动行) Client.
 * Supports:
 * - `engine: 'auto'` (default): Uses Direct HTTP for public routes with automatic fallback/cookie-bootstrap
 *   from OpenCLI Browser Bridge (`opencli browser work eval`) for authenticated routes or WAF recovery.
 * - `engine: 'direct'`: Pure Node HTTP client with `RequestPacer` and `HDX_COOKIE`.
 * - `engine: 'opencli'`: Pure in-origin browser `fetch()` via OpenCLI daemon.
 */
export class HuodongxingClient {
  constructor(options = {}) {
    this.configState = resolveRuntimeConfig(options);
    const resolved = this.configState.effective;
    this.engine = String(options.engine || resolved.engine || 'auto').toLowerCase();
    this.sharedPacer = new RequestPacer(options.minIntervalMs ?? resolved.minIntervalMs ?? 900);
    this.direct = new DirectClient({
      ...options,
      baseUrl: options.baseUrl || resolved.baseUrl,
      pacer: this.sharedPacer,
    });
    this.opencli = new OpenCliClient({
      ...options,
      session: options.session || resolved.session,
      timeoutMs: options.timeoutMs || resolved.timeoutMs,
      pacer: this.sharedPacer,
    });
  }

  /**
   * Executes a method on the selected engine with automatic fallback/bootstrap in `auto` mode.
   */
  async _dispatch(methodName, args = [], { requiresAuth = false } = {}) {
    if (this.engine === 'direct') {
      const data = await this.direct[methodName](...args);
      return this._tagEngine(data, 'direct');
    }
    if (this.engine === 'opencli') {
      const data = await this.opencli[methodName](...args);
      return this._tagEngine(data, 'opencli');
    }

    // auto mode:
    if (requiresAuth && !this.direct.hasCookie()) {
      // Try OpenCLI browser bridge first for authenticated endpoints when HDX_COOKIE is not set
      try {
        const data = await this.opencli[methodName](...args);
        return this._tagEngine(data, 'opencli');
      } catch (opencliErr) {
        // Fallback to direct if OpenCLI isn't running
        const data = await this.direct[methodName](...args);
        return this._tagEngine(data, 'direct');
      }
    }

    // Public endpoints or DirectClient already has cookie: try direct first, fallback to opencli on WAF/auth
    try {
      const data = await this.direct[methodName](...args);
      return this._tagEngine(data, 'direct');
    } catch (directErr) {
      if (directErr instanceof SecurityRouteDeniedError) {
        throw directErr;
      }
      const data = await this.opencli[methodName](...args);
      return this._tagEngine(data, 'opencli');
    }
  }

  _tagEngine(data, engine) {
    if (Array.isArray(data)) {
      return {
        engine,
        count: data.length,
        items: data,
      };
    }
    if (data && typeof data === 'object') {
      const extra = {};
      if (Array.isArray(data.tickets) && !Array.isArray(data.items)) {
        extra.items = data.tickets;
      } else if (Array.isArray(data.events) && !Array.isArray(data.items)) {
        extra.items = data.events;
      }
      return { engine, ...data, ...extra };
    }
    return data;
  }

  async status() {
    const browserStatus = await this.opencli.checkSessionStatus();
    let userState = null;
    let activeEngine = this.engine;
    try {
      if (browserStatus.available && this.engine !== 'direct') {
        userState = await this.opencli.getUserState();
        activeEngine = 'opencli';
      } else {
        userState = await this.direct.getUserState();
        activeEngine = 'direct';
      }
    } catch (err) {
      userState = { authenticated: false, error: err.message };
    }

    return {
      ok: Boolean(browserStatus.available || this.direct.hasCookie() || userState),
      configuredEngine: this.engine,
      activeEngine,
      directHasCookie: this.direct.hasCookie(),
      browserSession: browserStatus,
      userState,
    };
  }

  async searchEvents(args = {}) {
    const hasRegionOrMultiCity =
      Boolean(args.region) ||
      Boolean(args.cities) ||
      (typeof args.city === 'string' && /[,，、;/|\s]/.test(args.city.trim())) ||
      Boolean(args.city && parsers.REGION_PRESETS[String(args.city).trim().toLowerCase()]);

    if (hasRegionOrMultiCity) {
      const resolvedRegion = parsers.resolveRegionOrCities(
        args,
        this.configState.effective.defaultCities
      );
      if (resolvedRegion.cities.length > 1) {
        const limit = Math.min(Math.max(Number(args.limit || 20), 1), 100);
        const perCityFetch = Math.max(10, Math.ceil(limit / resolvedRegion.cities.length) + 5);
        const seen = new Set();
        const combined = [];
        let activeEngine = this.engine;

        for (const cityName of resolvedRegion.cities) {
          const singleRes = await this._dispatch(
            'searchEvents',
            [
              {
                ...args,
                city: cityName,
                cities: undefined,
                region: undefined,
                limit: perCityFetch,
              },
            ],
            { requiresAuth: false }
          );
          activeEngine = singleRes.engine || activeEngine;
          for (const item of singleRes.items || []) {
            if (!item?.id || seen.has(item.id)) continue;
            seen.add(item.id);
            combined.push({
              ...item,
              matchedCity: cityName,
            });
          }
        }

        const items = combined.slice(0, limit).map((row, idx) => ({
          ...row,
          rank: idx + 1,
        }));
        return {
          engine: activeEngine,
          region: resolvedRegion,
          count: items.length,
          items,
        };
      }
      return this._dispatch(
        'searchEvents',
        [{ ...args, city: resolvedRegion.cities[0], cities: undefined, region: undefined }],
        { requiresAuth: false }
      );
    }

    return this._dispatch('searchEvents', [args], { requiresAuth: false });
  }

  /**
   * Region-aware smart recommendation engine (`hdx recommend`).
   * Queries target regional cities (defaulting to operator config `['佛山', '广州', '深圳']`),
   * filters out past events and static promos, and scores/ranks events by regional priority,
   * theme keywords, time proximity, and offline presence.
   */
  async recommendEvents(options = {}) {
    const resolvedRegion = parsers.resolveRegionOrCities(
      {
        ...options,
        configSource: this.configState.sources.defaultCities || 'operator_default',
      },
      this.configState.effective.defaultCities
    );
    const explicitKw = options.keywords || options.keyword;
    const hasExplicitKw = Array.isArray(explicitKw)
      ? explicitKw.length > 0
      : Boolean(parsers.cleanText(explicitKw || ''));
    const rawKeywords = hasExplicitKw
      ? explicitKw
      : this.configState.effective.defaultKeywords;
    const keywords = (Array.isArray(rawKeywords)
      ? rawKeywords
      : String(rawKeywords).split(/[,，、;/|\s]+/)
    )
      .map((k) => parsers.cleanText(k))
      .filter(Boolean);

    const rawItemsByCity = {};
    let activeEngine = this.engine;
    const upcomingOnly = options.upcomingOnly !== false;

    for (const cityName of resolvedRegion.cities) {
      const res = await this._dispatch(
        'searchEvents',
        [
          {
            city: cityName,
            keyword: options.queryKeyword || '',
            tag: options.tag || '',
            orderby: options.orderby || 'o',
            date: options.date || '',
            dateTo: options.dateTo || '',
            page: Number(options.page || 1),
            limit: 30,
            upcomingOnly,
          },
        ],
        { requiresAuth: false }
      );
      activeEngine = res.engine || activeEngine;
      rawItemsByCity[cityName] = res.items || [];
    }

    const scored = parsers.scoreAndRankRegionalEvents(rawItemsByCity, {
      cities: resolvedRegion.cities,
      keywords,
      upcomingOnly,
      limit: Number(options.limit || 20),
      perCityLimit: Number(options.perCityLimit || 8),
      referenceDate: options.referenceDate,
    });

    return {
      engine: activeEngine,
      region: resolvedRegion,
      keywords,
      count: scored.items.length,
      stats: scored.stats,
      byCity: scored.byCity,
      items: scored.items,
    };
  }

  async getEventDetail(eventId) {
    return this._dispatch('getEventDetail', [eventId], { requiresAuth: false });
  }

  async getUserState() {
    return this._dispatch('getUserState', [], { requiresAuth: true });
  }

  async getTimeline(options = {}) {
    return this._dispatch('getTimeline', [options], { requiresAuth: true });
  }

  async getTickets(options = {}) {
    return this._dispatch('getTickets', [options], { requiresAuth: true });
  }

  async getTicketDetail(tid) {
    return this._dispatch('getTicketDetail', [tid], { requiresAuth: true });
  }

  async getFavorites(options = {}) {
    return this._dispatch('getFavorites', [options], { requiresAuth: true });
  }

  async getFollowing(options = {}) {
    return this._dispatch('getFollowing', [options], { requiresAuth: true });
  }

  async getProfile() {
    return this._dispatch('getProfile', [], { requiresAuth: true });
  }

  async updateProfile(changes = {}, options = {}) {
    return this._dispatch('updateProfile', [changes, options], { requiresAuth: true });
  }

  async getOrganizers(options = {}) {
    return this._dispatch('getOrganizers', [options], { requiresAuth: false });
  }

  async getRanklist(options = {}) {
    return this._dispatch('getRanklist', [options], { requiresAuth: false });
  }

  async getTopics(options = {}) {
    return this._dispatch('getTopics', [options], { requiresAuth: false });
  }

  async getConsoleHome() {
    return this._dispatch('getConsoleHome', [], { requiresAuth: true });
  }

  async getConsoleEvents(options = {}) {
    return this._dispatch('getConsoleEvents', [options], { requiresAuth: true });
  }

  async registerEvent(eventId, payload = {}, options = {}) {
    return this._dispatch('registerEvent', [eventId, payload, options], { requiresAuth: false });
  }

  async exportTicketsIcs(options = {}) {
    const res = await this.getTickets(options);
    const items = res.items || [];
    const ics = generateTicketsIcs(items, options);
    return {
      engine: res.engine,
      count: items.length,
      ics,
    };
  }
}

export {
  VERSION,
  PACKAGE_NAME,
  LICENSE,
  DESCRIPTION,
  DirectClient,
  OpenCliClient,
  SecurityRouteDeniedError,
  SECURITY_ROUTE_DENYLIST,
  assertSafeRoute,
  inspectRouteSafety,
  assertSafeCliAction,
  RequestPacer,
  parsers,
  generateTicketsIcs,
  generateEventsIcs,
  parseTicketDateRange,
  getConfigOverrideFile,
  resolveRuntimeConfig,
  updateOperatorConfig,
  checkUpstreamOpencliOwnerFix,
  classifySample,
  runDiagnosticReconcile,
  getWatchlistFile,
  extractCanonicalEventId,
  listWatchlist,
  upsertWatchlistItem,
  updateWatchlistItem,
  deleteWatchlistItem,
  exportWatchlistIcs,
  createConsoleServer,
  formatOutput,
  toCsv,
  toMarkdownTable,
  toTerminalTable,
};
