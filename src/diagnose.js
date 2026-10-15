import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PACKAGE_NAME, VERSION, LICENSE, DESCRIPTION } from './version.js';
import { SECURITY_ROUTE_DENYLIST, inspectRouteSafety } from './security-guard.js';
import {
  buildEventsUrl,
  REGION_PRESETS,
  DEFAULT_RECOMMEND_KEYWORDS,
  isCityOrRegionInput,
  resolveRegionOrCities,
} from './parsers.js';

export const DEFAULT_BASE_URL = 'https://www.huodongxing.com';
export const UPSTREAM_OPENCLI_EVENTS_PATH =
  process.env.HDX_UPSTREAM_OPENCLI_EVENTS ||
  path.join(
    os.homedir(),
    '.hermes',
    'node',
    'lib',
    'node_modules',
    '@jackwener',
    'opencli',
    'clis',
    'huodongxing',
    'events.js'
  );

export function getConfigOverrideFile() {
  return (
    process.env.HDX_CONFIG_PATH ||
    path.join(os.homedir(), '.config', 'huodongxing-cli', 'config.json')
  );
}

function redactHome(filePath) {
  const home = os.homedir();
  if (home && String(filePath).startsWith(home)) {
    return `~${String(filePath).slice(home.length)}`;
  }
  return String(filePath);
}

/**
 * Resolve runtime configuration with explicit source attribution (SSOT: Default < ConfigFile < Env < CLI Override).
 * Supports "能读" (inspect current rules & sources) and "能调" (controlled runtime overrides).
 */
export function resolveRuntimeConfig(cliOverrides = {}) {
  const configFile = getConfigOverrideFile();
  const defaults = {
    baseUrl: DEFAULT_BASE_URL,
    engine: 'auto',
    session: 'work',
    minIntervalMs: 900,
    timeoutMs: 25000,
    defaultEventId: '2871552596500',
    defaultRegion: 'gba',
    defaultCities: ['佛山', '广州', '深圳'],
    defaultKeywords: DEFAULT_RECOMMEND_KEYWORDS,
  };

  let fileConfig = {};
  let fileConfigLoaded = false;
  try {
    if (fs.existsSync(configFile)) {
      fileConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      fileConfigLoaded = true;
    }
  } catch {
    fileConfig = {};
  }
  if (fileConfig.defaultRegion && !fileConfig.defaultCities) {
    fileConfig.defaultCities = resolveRegionOrCities({ region: fileConfig.defaultRegion }).cities;
  }

  const envConfig = {};
  if (process.env.HDX_BASE_URL) envConfig.baseUrl = process.env.HDX_BASE_URL;
  if (process.env.HDX_ENGINE) envConfig.engine = process.env.HDX_ENGINE;
  if (process.env.HDX_BROWSER_SESSION) envConfig.session = process.env.HDX_BROWSER_SESSION;
  if (process.env.HDX_MIN_INTERVAL_MS) envConfig.minIntervalMs = Number(process.env.HDX_MIN_INTERVAL_MS);
  if (process.env.HDX_TIMEOUT_MS) envConfig.timeoutMs = Number(process.env.HDX_TIMEOUT_MS);
  if (process.env.HDX_DEFAULT_EVENT_ID) envConfig.defaultEventId = process.env.HDX_DEFAULT_EVENT_ID;
  if (process.env.HDX_DEFAULT_REGION) {
    envConfig.defaultRegion = process.env.HDX_DEFAULT_REGION;
    if (!process.env.HDX_DEFAULT_CITIES) {
      envConfig.defaultCities = resolveRegionOrCities({ region: process.env.HDX_DEFAULT_REGION }).cities;
    }
  }
  if (process.env.HDX_DEFAULT_CITIES) {
    envConfig.defaultCities = resolveRegionOrCities({ cities: process.env.HDX_DEFAULT_CITIES }).cities;
  }
  if (process.env.HDX_DEFAULT_KEYWORDS) {
    envConfig.defaultKeywords = process.env.HDX_DEFAULT_KEYWORDS.split(/[,，、;/|\s]+/).filter(Boolean);
  }

  const cleanCli = Object.fromEntries(
    Object.entries(cliOverrides).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );
  if (cleanCli.defaultRegion && !cleanCli.defaultCities) {
    cleanCli.defaultCities = resolveRegionOrCities({ region: cleanCli.defaultRegion }).cities;
  }

  const effective = {
    ...defaults,
    ...fileConfig,
    ...envConfig,
    ...cleanCli,
  };

  if (typeof effective.defaultCities === 'string') {
    effective.defaultCities = resolveRegionOrCities({ cities: effective.defaultCities }).cities;
  }
  if (typeof effective.defaultKeywords === 'string') {
    effective.defaultKeywords = effective.defaultKeywords.split(/[,，、;/|\s]+/).filter(Boolean);
  }

  const sources = {};
  for (const key of Object.keys(defaults)) {
    if (key in cleanCli) sources[key] = 'cli_override';
    else if (key in envConfig) sources[key] = 'environment';
    else if (key in fileConfig) sources[key] = `config_file (${redactHome(configFile)})`;
    else sources[key] = 'default';
  }

  return {
    package: PACKAGE_NAME,
    version: VERSION,
    license: LICENSE,
    description: DESCRIPTION,
    configFilePath: redactHome(configFile),
    configFileLoaded: fileConfigLoaded,
    effective,
    sources,
    regionPresets: Object.fromEntries(
      Object.entries(REGION_PRESETS).map(([k, v]) => [k, { label: v.label, cities: v.cities, aliases: v.aliases }])
    ),
    cookiePresent: Boolean(process.env.HDX_COOKIE || cliOverrides.cookie),
    cookieSource: cliOverrides.cookie
      ? 'cli_override'
      : process.env.HDX_COOKIE
        ? 'environment (HDX_COOKIE)'
        : 'none',
    securityRules: SECURITY_ROUTE_DENYLIST.map((r) => ({
      id: r.id,
      category: r.category,
      methods: r.methods,
      pattern: r.pattern.toString(),
      reason: r.reason,
    })),
  };
}

/**
 * Save or reset operator-tuned configuration in ~/.config/huodongxing-cli/config.json ("能调").
 */
export function updateOperatorConfig(updates = {}, { reset = false } = {}) {
  const configFile = getConfigOverrideFile();
  const dir = path.dirname(configFile);
  if (reset) {
    if (fs.existsSync(configFile)) {
      fs.unlinkSync(configFile);
    }
    return resolveRuntimeConfig();
  }

  const allowedKeys = new Set([
    'baseUrl',
    'engine',
    'session',
    'minIntervalMs',
    'timeoutMs',
    'defaultEventId',
    'defaultRegion',
    'defaultCities',
    'defaultKeywords',
  ]);
  let existing = {};
  try {
    if (fs.existsSync(configFile)) {
      existing = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    }
  } catch {
    existing = {};
  }

  const next = { ...existing };
  for (const [k, v] of Object.entries(updates)) {
    if (!allowedKeys.has(k)) {
      throw new Error(`Unsupported config key: ${k}. Allowed keys: ${Array.from(allowedKeys).join(', ')}`);
    }
    if (k === 'minIntervalMs') {
      const num = Number(v);
      if (!Number.isFinite(num) || num < 100 || num > 60000) {
        throw new Error('minIntervalMs must be a number between 100 and 60000');
      }
      next[k] = Math.round(num);
    } else if (k === 'timeoutMs') {
      const num = Number(v);
      if (!Number.isFinite(num) || num < 1000 || num > 120000) {
        throw new Error('timeoutMs must be a number between 1000 and 120000');
      }
      next[k] = Math.round(num);
    } else if (k === 'engine') {
      const eng = String(v || '').trim().toLowerCase();
      if (!['auto', 'direct', 'opencli'].includes(eng)) {
        throw new Error('engine must be one of: auto, direct, opencli');
      }
      next[k] = eng;
    } else if (k === 'defaultCities') {
      const rawStr = Array.isArray(v) ? v.join(',') : String(v ?? '').trim();
      if (!rawStr) {
        throw new Error('defaultCities cannot be empty');
      }
      next[k] = resolveRegionOrCities({ cities: rawStr }).cities;
    } else if (k === 'defaultRegion') {
      const reg = String(v ?? '').trim();
      if (!reg) {
        throw new Error('defaultRegion cannot be empty');
      }
      next[k] = reg;
      if (!('defaultCities' in updates)) {
        next.defaultCities = resolveRegionOrCities({ region: reg }).cities;
      }
    } else if (k === 'defaultKeywords') {
      const kwList = Array.isArray(v)
        ? v.map((x) => String(x).trim()).filter(Boolean)
        : String(v ?? '').split(/[,，、;/|\s]+/).map((x) => x.trim()).filter(Boolean);
      if (kwList.length === 0) {
        throw new Error('defaultKeywords cannot be empty');
      }
      next[k] = kwList;
    } else {
      next[k] = v;
    }
  }

  fs.mkdirSync(dir, { recursive: true });
  const tmpFile = `${configFile}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  fs.writeFileSync(tmpFile, JSON.stringify(next, null, 2) + '\n', 'utf8');
  fs.renameSync(tmpFile, configFile);
  return resolveRuntimeConfig();
}

/**
 * Inspect whether the upstream OpenCLI owner bug (d=ts HTTP 500, city normalization, promo filter) is fixed.
 */
export function checkUpstreamOpencliOwnerFix() {
  try {
    if (!fs.existsSync(UPSTREAM_OPENCLI_EVENTS_PATH)) {
      return {
        checked: false,
        path: redactHome(UPSTREAM_OPENCLI_EVENTS_PATH),
        status: 'not_installed',
      };
    }
    const content = fs.readFileSync(UPSTREAM_OPENCLI_EVENTS_PATH, 'utf8');
    const hasUnconditionalDts =
      content.includes("params.set('d', 'ts');") &&
      !content.includes('dateRange.date || dateRange.dateTo') &&
      !content.includes('args.date || args.dateTo');
    const cityNormalization = content.includes('normalizeCityName');
    const promoBannerFilter = content.includes('if (!time && !location) continue');
    const upcomingStatusParam = content.includes("params.set('status', '1')");
    const weekdayYearAlignment = content.includes('WEEKDAY_INDEX');
    const fixed =
      !hasUnconditionalDts &&
      cityNormalization &&
      promoBannerFilter &&
      upcomingStatusParam &&
      weekdayYearAlignment;
    return {
      checked: true,
      path: redactHome(UPSTREAM_OPENCLI_EVENTS_PATH),
      fixed,
      cityNormalization,
      promoBannerFilter,
      upcomingStatusParam,
      weekdayYearAlignment,
      status: fixed ? 'repaired' : 'unpatched_d_ts_bug',
    };
  } catch (err) {
    return {
      checked: false,
      path: redactHome(UPSTREAM_OPENCLI_EVENTS_PATH),
      status: `error: ${err.message}`,
    };
  }
}

/**
 * "能试" (Sample Classifier & Rule Explainer):
 * Calls the REAL inspectRouteSafety, region/city normalizer, and route/parser matching logic on a sample input.
 */
export function classifySample(sampleInput, options = {}) {
  const raw = String(sampleInput || '').trim();
  if (!raw) {
    return {
      valid: false,
      input: raw,
      reason: 'Empty sample input',
    };
  }

  const config = resolveRuntimeConfig(options).effective;
  const isCityOrRegion = !/^https?:\/\//i.test(raw) && !raw.startsWith('/') && !/^\d{6,20}$/.test(raw) && isCityOrRegionInput(raw);
  const regionResolution = isCityOrRegion
    ? resolveRegionOrCities({ cities: raw }, config.defaultCities)
    : resolveRegionOrCities({}, config.defaultCities);

  let normalizedUrl = raw;
  let candidateUrls = null;
  if (/^\d{6,20}$/.test(raw)) {
    normalizedUrl = `${config.baseUrl}/event/${raw}`;
  } else if (raw.startsWith('/')) {
    normalizedUrl = `${config.baseUrl}${raw}`;
  } else if (!/^https?:\/\//i.test(raw)) {
    if (isCityOrRegion) {
      normalizedUrl = buildEventsUrl({ city: regionResolution.cities[0] });
      candidateUrls = regionResolution.cities.map((c) => buildEventsUrl({ city: c }));
    } else {
      normalizedUrl = buildEventsUrl({ city: '全部', qs: raw });
    }
  }

  const method = (options.method || 'GET').toUpperCase();
  const securityVerdict = inspectRouteSafety(method, normalizedUrl);

  let parsedUrl;
  try {
    parsedUrl = new URL(normalizedUrl);
  } catch {
    return {
      valid: false,
      input: raw,
      normalizedUrl,
      regionResolution,
      securityVerdict,
      reason: 'Invalid URL syntax',
    };
  }

  const pathname = parsedUrl.pathname;
  const routeTable = [
    {
      id: 'ROUTE_HOME_PORTAL',
      match: (p) => p === '/' || p === '/index',
      area: '01_home_portal',
      authRequired: false,
      parser: 'parseEventsHtml',
      cliCommand: 'huodongxing events',
      description: 'Homepage portal & featured city events',
    },
    {
      id: 'ROUTE_EVENTS_SEARCH',
      match: (p) => p === '/events',
      area: '02_events_search',
      authRequired: false,
      parser: 'parseEventsHtml / scoreAndRankRegionalEvents',
      cliCommand: 'huodongxing events | huodongxing recommend',
      description: 'Public event search, multi-city regional discovery & recommendation',
    },
    {
      id: 'ROUTE_EVENT_DETAIL',
      match: (p) => /^\/event\/\d+/.test(p),
      area: '03_event_detail',
      authRequired: false,
      parser: 'parseEventDetailHtml',
      cliCommand: 'huodongxing detail <eventId>',
      description: 'Event detail page with inline ticket JSON & registration fields',
    },
    {
      id: 'ROUTE_ORGANIZERS',
      match: (p) => p.startsWith('/zhubanfang'),
      area: '04_organizers_directory',
      authRequired: false,
      parser: 'parseOrganizersHtml',
      cliCommand: 'huodongxing organizers',
      description: 'Organizer directory & host statistics',
    },
    {
      id: 'ROUTE_RANKLIST',
      match: (p) => p.startsWith('/ranklist'),
      area: '05_popularity_ranklist',
      authRequired: false,
      parser: 'parseRanklistHtml',
      cliCommand: 'huodongxing ranklist',
      description: 'Popularity & heat index ranklist',
    },
    {
      id: 'ROUTE_SPECIAL_TOPICS',
      match: (p) => p.startsWith('/topic'),
      area: '06_special_topics',
      authRequired: false,
      parser: 'parseTopicsHtml',
      cliCommand: 'huodongxing topics',
      description: 'Curated special topics & collections',
    },
    {
      id: 'ROUTE_USER_TIMELINE',
      match: (p) => p === '/user/index',
      area: '07_user_index_timeline',
      authRequired: true,
      parser: 'parseTimelineHtml',
      cliCommand: 'huodongxing timeline',
      description: 'Authenticated personal activity timeline',
    },
    {
      id: 'ROUTE_USER_TICKETS',
      match: (p) => p === '/user/regevents' || p === '/user/regdetail' || p === '/user/tikcets',
      area: '08_user_tickets_regevents',
      authRequired: true,
      parser: pathname === '/user/regevents' ? 'parseTicketsHtml' : 'parseTicketDetailHtml',
      cliCommand: pathname === '/user/regevents' ? 'huodongxing tickets' : 'huodongxing ticket-detail <tid>',
      description: 'Authenticated personal tickets & order e-tickets',
    },
    {
      id: 'ROUTE_USER_FOLLOWS',
      match: (p) => p === '/user/userfollows' || p === '/user/favoriteevents' || p === '/user/favoriteorgs',
      area: '09_user_follows_favorites',
      authRequired: true,
      parser: 'parseFavoritesHtml / parseFollowingHtml',
      cliCommand: 'huodongxing favorites | huodongxing following',
      description: 'Authenticated followed organizers & saved events',
    },
    {
      id: 'ROUTE_ACCOUNT_PROFILE',
      match: (p) => p === '/account/profile' || p === '/profile',
      area: '10_account_profile',
      authRequired: true,
      parser: 'parseProfileHtml',
      cliCommand: 'huodongxing profile',
      description: 'Account profile settings & reversible POST /profile update',
    },
    {
      id: 'ROUTE_CONSOLE_HOME',
      match: (p) => p === '/console/home',
      area: '11_console_home',
      authRequired: true,
      parser: 'parseConsoleHomeHtml',
      cliCommand: 'huodongxing console-home',
      description: 'Organizer console dashboard & Hawk MAC credentials',
    },
    {
      id: 'ROUTE_CONSOLE_EVENTS',
      match: (p) => p === '/console/eventadmin' || p === '/console/userpubevents',
      area: '12_console_eventadmin',
      authRequired: true,
      parser: 'parseConsoleEventsHtml',
      cliCommand: 'huodongxing console-events',
      description: 'Organizer published events & JSON AJAX pagination',
    },
  ];

  const matchedRoute = routeTable.find((r) => r.match(pathname)) || null;

  return {
    valid: true,
    input: raw,
    method,
    normalizedUrl,
    ...(candidateUrls ? { candidateUrls } : {}),
    pathname,
    query: Object.fromEntries(parsedUrl.searchParams.entries()),
    regionResolution,
    securityVerdict,
    matchedRoute: matchedRoute
      ? {
          id: matchedRoute.id,
          area: matchedRoute.area,
          authRequired: matchedRoute.authRequired,
          parser: matchedRoute.parser,
          cliCommand: matchedRoute.cliCommand,
          description: matchedRoute.description,
        }
      : {
          id: 'ROUTE_UNMAPPED',
          area: 'custom',
          authRequired: null,
          parser: 'raw_html_or_json',
          cliCommand: null,
          description: 'Unmapped custom Huodongxing endpoint',
        },
  };
}

/**
 * Full Diagnostic Reconciler ("对账器优先"):
 * Verifies config state, security guard, upstream d=ts fix, and live engine parity.
 */
export async function runDiagnosticReconcile(client, options = {}) {
  const configState = resolveRuntimeConfig(options);
  const upstreamCheck = checkUpstreamOpencliOwnerFix();

  const defaultSearchUrl = buildEventsUrl({ keyword: 'AI', page: 1 });
  const datedSearchUrl = buildEventsUrl({ keyword: 'AI', date: '2026-10-01', dateTo: '2026-10-31' });
  const dtsContractOk = !defaultSearchUrl.includes('d=ts') && datedSearchUrl.includes('d=ts');

  const multiCityCheck = classifySample('foshan,guangzhou,shenzhen');
  const keywordCheck = classifySample('AI智能体峰会');
  const sampleChecks = {
    eventDetailAllowed: classifySample('2871552596500').securityVerdict.allowed === true,
    multiCitySampleResolved:
      multiCityCheck.query.city === '佛山' &&
      Array.isArray(multiCityCheck.candidateUrls) &&
      multiCityCheck.candidateUrls.length === 3,
    keywordSampleResolved:
      keywordCheck.query.qs === 'AI智能体峰会' && keywordCheck.query.city === '全部',
    cashierBlocked: classifySample('https://www.huodongxing.com/payment/cashier?order=1', { method: 'POST' }).securityVerdict.allowed === false,
    pwdBlocked: classifySample('https://www.huodongxing.com/account/pwd', { method: 'POST' }).securityVerdict.allowed === false,
    refundBlocked: classifySample('https://www.huodongxing.com/order/refund', { method: 'POST' }).securityVerdict.allowed === false,
  };

  let liveProbes = null;
  if (!options.offline && client) {
    liveProbes = {};
    try {
      const status = await client.status();
      liveProbes.status = status;
    } catch (err) {
      liveProbes.status = { ok: false, error: err.message };
    }

    try {
      const searchRes = await client.searchEvents({ limit: 3 });
      liveProbes.eventsSearch = {
        ok: Array.isArray(searchRes.items) && searchRes.items.length > 0,
        engine: searchRes.engine,
        count: searchRes.items?.length || 0,
        firstEventId: searchRes.items?.[0]?.id || searchRes.items?.[0]?.event_id || null,
      };
    } catch (err) {
      liveProbes.eventsSearch = { ok: false, error: err.message };
    }
  }

  const allStaticPassed =
    dtsContractOk &&
    sampleChecks.eventDetailAllowed &&
    sampleChecks.multiCitySampleResolved &&
    sampleChecks.keywordSampleResolved &&
    sampleChecks.cashierBlocked &&
    sampleChecks.pwdBlocked &&
    sampleChecks.refundBlocked;

  const allLivePassed =
    !liveProbes || (Boolean(liveProbes.status?.ok) && Boolean(liveProbes.eventsSearch?.ok));

  return {
    ok: allStaticPassed && allLivePassed,
    timestamp: new Date().toISOString(),
    configState,
    upstreamOpencliFix: upstreamCheck,
    contracts: {
      dtsQueryRegression: {
        ok: dtsContractOk,
        defaultSearchUrl,
        datedSearchUrl,
      },
      securityGuardChecks: sampleChecks,
    },
    liveProbes,
  };
}
