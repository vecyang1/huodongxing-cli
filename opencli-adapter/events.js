import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, CommandExecutionError, EmptyResultError } from '@jackwener/opencli/errors';

const BASE_URL = 'https://www.huodongxing.com/events';
const MAX_LIMIT = 50;
const RESULT_CARD_SELECTOR = '.search-tab-content-item-mesh';
export const EVENTS_COLUMNS = [
  'rank',
  'id',
  'title',
  'time',
  'eventType',
  'city',
  'location',
  'organizer',
  'url',
];

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function requireLimit(value) {
  const raw = value ?? 20;
  const limit = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new ArgumentError('huodongxing limit must be a positive integer');
  }
  if (limit > MAX_LIMIT) {
    throw new ArgumentError(`huodongxing limit must be <= ${MAX_LIMIT}`);
  }
  return limit;
}

function appendIfPresent(params, name, value) {
  const text = cleanText(value);
  if (text) params.set(name, text);
}

function dateOrdinal(year, month, day) {
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function parseYmd(value) {
  const match = cleanText(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }
  return dateOrdinal(year, month, day);
}

function requireYmdArg(value, label) {
  const text = cleanText(value);
  if (!text) return '';
  if (parseYmd(text) == null) {
    throw new ArgumentError(`huodongxing ${label} must be a valid YYYY-MM-DD date`);
  }
  return text;
}

function requireDateRangeArgs(args = {}) {
  const date = requireYmdArg(args.date, 'date');
  const dateTo = requireYmdArg(args.dateTo, 'dateTo');
  if (date && dateTo && parseYmd(date) > parseYmd(dateTo)) {
    throw new ArgumentError('huodongxing date must be <= dateTo');
  }
  return { date, dateTo };
}

function unwrapEvaluateResult(payload) {
  if (payload && !Array.isArray(payload) && typeof payload === 'object' && 'session' in payload && 'data' in payload) {
    return payload.data;
  }
  return payload;
}

function localDateOrdinal(date) {
  return dateOrdinal(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function parseMonthDayToken(token, year) {
  const match = cleanText(token).match(/(\d{1,2})[/-](\d{1,2})/);
  if (!match) return null;
  return {
    month: Number(match[1]),
    day: Number(match[2]),
    ordinal: dateOrdinal(year, Number(match[1]), Number(match[2])),
  };
}

function parseEventTimeRange(timeText, options = {}) {
  const rawText = cleanText(timeText);
  if (!rawText) return null;
  const text = rawText
    .replace(/(\d{4})[年.](\d{1,2})[月.](\d{1,2})日?/g, '$1/$2/$3')
    .replace(/(\d{1,2})月(\d{1,2})日?/g, '$1/$2')
    .replace(/(\d{1,2})\.(\d{1,2})/g, '$1/$2');
  const filterStart = parseYmd(options.date);
  const referenceDate = options.referenceDate instanceof Date ? options.referenceDate : new Date();
  const referenceOrdinal = localDateOrdinal(referenceDate);
  if (/今天/.test(text)) return { start: referenceOrdinal, end: referenceOrdinal };
  if (/明天/.test(text)) return { start: referenceOrdinal + 1, end: referenceOrdinal + 1 };
  if (/后天/.test(text)) return { start: referenceOrdinal + 2, end: referenceOrdinal + 2 };

  const explicitYearMatch = text.match(/(\d{4})[/-]\d{1,2}[/-]\d{1,2}/);
  const baseYear = options.year ?? (
    explicitYearMatch
      ? Number(explicitYearMatch[1])
      : cleanText(options.date).match(/^(\d{4})-/)?.[1]
        ? Number(cleanText(options.date).slice(0, 4))
        : referenceDate.getFullYear()
  );
  const strippedYearText = text.replace(/\b\d{4}[/-]/g, '');
  const tokens = Array.from(strippedYearText.matchAll(/(\d{1,2}[/-]\d{1,2})/g)).map((match) => match[1]);
  if (tokens.length === 0) return null;
  let start = parseMonthDayToken(tokens[0], baseYear);
  if (!start) return null;
  if (!explicitYearMatch && referenceDate.getMonth() + 1 >= 10 && start.month <= 2 && !options.year) {
    start = parseMonthDayToken(tokens[0], baseYear + 1) || start;
  }
  if (tokens.length === 1) return { start: start.ordinal, end: start.ordinal };
  const effectiveStartYear = !explicitYearMatch && referenceDate.getMonth() + 1 >= 10 && start.month <= 2
    ? baseYear + 1
    : baseYear;
  const endYear = parseMonthDayToken(tokens[1], effectiveStartYear)?.month < start.month
    ? effectiveStartYear + 1
    : effectiveStartYear;
  const end = parseMonthDayToken(tokens[1], endYear);
  if (!end) return { start: start.ordinal, end: start.ordinal };

  // If the parsed range is clearly before the requested window, try the next
  // year. Huodongxing listings omit the year, but searches can cross New Year.
  if (filterStart != null && end.ordinal < filterStart && start.month >= 10) {
    const nextStart = parseMonthDayToken(tokens[0], baseYear + 1);
    const nextEndYear = parseMonthDayToken(tokens[1], baseYear + 1)?.month < nextStart.month ? baseYear + 2 : baseYear + 1;
    const nextEnd = parseMonthDayToken(tokens[1], nextEndYear);
    if (nextStart && nextEnd) return { start: nextStart.ordinal, end: nextEnd.ordinal };
  }
  return { start: start.ordinal, end: end.ordinal };
}

const CITY_ALIAS_MAP = {
  foshan: '佛山',
  fs: '佛山',
  '佛山市': '佛山',
  '佛山': '佛山',
  guangzhou: '广州',
  gz: '广州',
  canton: '广州',
  '广州市': '广州',
  '广州': '广州',
  shenzhen: '深圳',
  sz: '深圳',
  '深圳市': '深圳',
  '深圳': '深圳',
  dongguan: '东莞',
  dg: '东莞',
  '东莞市': '东莞',
  '东莞': '东莞',
  zhuhai: '珠海',
  zh: '珠海',
  '珠海市': '珠海',
  '珠海': '珠海',
  hongkong: '香港',
  'hong kong': '香港',
  hk: '香港',
  '香港': '香港',
  macau: '澳门',
  macao: '澳门',
  '澳门': '澳门',
  beijing: '北京',
  bj: '北京',
  '北京市': '北京',
  '北京': '北京',
  shanghai: '上海',
  sh: '上海',
  '上海市': '上海',
  '上海': '上海',
  hangzhou: '杭州',
  hz: '杭州',
  '杭州市': '杭州',
  '杭州': '杭州',
  suzhou: '苏州',
  '苏州市': '苏州',
  '苏州': '苏州',
  nanjing: '南京',
  nj: '南京',
  '南京市': '南京',
  '南京': '南京',
  chengdu: '成都',
  cd: '成都',
  '成都市': '成都',
  '成都': '成都',
  chongqing: '重庆',
  cq: '重庆',
  '重庆市': '重庆',
  '重庆': '重庆',
  wuhan: '武汉',
  wh: '武汉',
  '武汉市': '武汉',
  '武汉': '武汉',
  xian: '西安',
  "xi'an": '西安',
  xa: '西安',
  '西安市': '西安',
  '西安': '西安',
  changsha: '长沙',
  cs: '长沙',
  '长沙市': '长沙',
  '长沙': '长沙',
  xiamen: '厦门',
  xm: '厦门',
  '厦门市': '厦门',
  '厦门': '厦门',
  tianjin: '天津',
  tj: '天津',
  '天津市': '天津',
  '天津': '天津',
  all: '全部',
  any: '全部',
  '*': '全部',
  '全国': '全部',
  '全部': '全部',
};

const REGION_PRESETS = {
  gba: ['佛山', '广州', '深圳'],
  prd: ['佛山', '广州', '深圳'],
  'bay-area': ['佛山', '广州', '深圳'],
  'greater-bay-area': ['佛山', '广州', '深圳'],
  guangfoshen: ['佛山', '广州', '深圳'],
  fgs: ['佛山', '广州', '深圳'],
  '广佛深': ['佛山', '广州', '深圳'],
  '珠三角': ['佛山', '广州', '深圳'],
  '大湾区': ['佛山', '广州', '深圳'],
  '粤港澳': ['佛山', '广州', '深圳'],
  '粤港澳大湾区': ['佛山', '广州', '深圳'],
  '华南': ['佛山', '广州', '深圳'],
  'gba-full': ['佛山', '广州', '深圳', '东莞', '珠海', '香港'],
  yrd: ['上海', '杭州', '苏州'],
  '长三角': ['上海', '杭州', '苏州'],
  '江浙沪': ['上海', '杭州', '苏州'],
  jjj: ['北京', '天津'],
  '京津冀': ['北京', '天津'],
  sw: ['成都', '重庆'],
  '成渝': ['成都', '重庆'],
};

export function normalizeCityName(input) {
  const raw = cleanText(input);
  if (!raw) return '全部';
  const lower = raw.toLowerCase();
  if (CITY_ALIAS_MAP[lower]) return CITY_ALIAS_MAP[lower];
  if (CITY_ALIAS_MAP[raw]) return CITY_ALIAS_MAP[raw];
  if (raw.length >= 3 && raw.endsWith('市')) return raw.slice(0, -1);
  return raw;
}

export function resolveCitiesList(args = {}) {
  const raw = cleanText(args.cities || args.region || args.city || '全部');
  const lower = raw.toLowerCase();
  if (REGION_PRESETS[lower] || REGION_PRESETS[raw]) {
    return [...(REGION_PRESETS[lower] || REGION_PRESETS[raw])];
  }
  const tokens = raw
    .split(/[,，、;/|\s]+/)
    .map((t) => cleanText(t))
    .filter(Boolean);
  const expanded = [];
  for (const tok of tokens) {
    const preset = REGION_PRESETS[tok.toLowerCase()] || REGION_PRESETS[tok];
    if (preset) expanded.push(...preset);
    else expanded.push(normalizeCityName(tok));
  }
  const deduped = Array.from(new Set(expanded.filter(Boolean)));
  return deduped.length > 0 ? deduped : ['全部'];
}

export function filterRowsByDateRange(rows, options = {}) {
  requireDateRangeArgs(options);
  const filterStart = parseYmd(options.date);
  const filterEnd = parseYmd(options.dateTo) ?? filterStart;
  const upcomingOnly = Boolean(options.upcomingOnly);
  if (filterStart == null && filterEnd == null && !upcomingOnly) {
    return rows.map((row, index) => ({ ...row, rank: index + 1 }));
  }
  const referenceDate = options.referenceDate instanceof Date ? options.referenceDate : new Date();
  const todayOrdinal = localDateOrdinal(referenceDate);
  const start = filterStart ?? filterEnd;
  const end = filterEnd ?? filterStart;
  const filtered = rows.filter((row) => {
    const range = parseEventTimeRange(row.time, options);
    if (!range) return !upcomingOnly;
    if (upcomingOnly && range.end < todayOrdinal) return false;
    if (start != null && end != null) {
      return range.start <= end && range.end >= start;
    }
    return true;
  });
  return filtered.map((row, index) => ({ ...row, rank: index + 1 }));
}

export function buildEventsUrl(args = {}) {
  const dateRange = requireDateRangeArgs(args);
  const params = new URLSearchParams();
  params.set('orderby', cleanText(args.orderby) || 'o');
  if (dateRange.date || dateRange.dateTo) {
    params.set('d', 'ts');
    appendIfPresent(params, 'date', dateRange.date);
    appendIfPresent(params, 'dateTo', dateRange.dateTo);
  }
  appendIfPresent(params, 'tag', args.tag);
  appendIfPresent(params, 'city', normalizeCityName(args.city));
  const eventType = cleanText(args.eventType);
  if (eventType) {
    if (eventType !== '1' && eventType !== '2') {
      throw new ArgumentError('huodongxing eventType must be 1 (offline) or 2 (online)');
    }
    params.set('eventType', eventType);
  }
  appendIfPresent(params, 'qs', args.qs);
  return `${BASE_URL}?${params.toString()}`;
}

export function extractEventRowsPayload(limit = 20) {
  const maxLimit = 50;
  const rawLimit = limit ?? 20;
  const count = typeof rawLimit === 'number' ? rawLimit : Number(String(rawLimit).trim());
  if (!Number.isInteger(count) || count <= 0 || count > maxLimit) {
    return {
      ok: false,
      code: 'INVALID_LIMIT',
      message: `huodongxing limit must be a positive integer <= ${maxLimit}`,
    };
  }
  const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const text = (root, selector) => clean(root.querySelector(selector)?.textContent ?? '');
  const idFromHref = (href) => {
    const match = String(href ?? '').match(/\/event\/(\d+)/);
    return match ? match[1] : '';
  };
  const eventUrl = (id) => `https://www.huodongxing.com/event/${id}`;
  const kind = (card, location) => {
    if (card.querySelector('.item-live-icon')) return 'online';
    if (card.querySelector('.item-dress-icon')) return 'offline';
    if (/线上|在线|直播/.test(location)) return 'online';
    return '';
  };
  const cards = Array.from(document.querySelectorAll('.search-tab-content-item-mesh'));
  const rows = [];
  const seen = new Set();

  for (const card of cards) {
    if (rows.length >= count) break;
    const link = card.querySelector('a.item-title[href*="/event/"], a[href*="/event/"]');
    const id = idFromHref(link?.getAttribute('href') ?? '');
    if (!id || seen.has(id)) continue;

    const title = clean(
      text(card, 'a.item-title span')
      || text(card, 'a.item-title')
      || card.querySelector('img.item-logo')?.getAttribute('alt')
      || '',
    );
    if (!title) continue;

    const time = text(card, '.item-dress p:not(.item-dress-pp)');
    const location = text(card, '.item-dress-pp');
    // Skip static platform promotional banners that have neither event time nor location
    if (!time && !location) continue;

    const organizer = clean(
      text(card, '.item-bottom-left .user-name')
      || card.querySelector('.item-bottom-left img[title]')?.getAttribute('title')
      || card.querySelector('.item-bottom-left img[alt]')?.getAttribute('alt')
      || '',
    );
    seen.add(id);
    rows.push({
      rank: rows.length + 1,
      id,
      title,
      time,
      eventType: kind(card, location),
      city: location,
      location,
      organizer,
      url: eventUrl(id),
    });
  }

  if (rows.length === 0) {
    const pageText = clean(document.body?.textContent ?? '');
    if (/操作过于频繁|too\s+frequent|rate\s*limit/i.test(pageText)) {
      return {
        ok: false,
        code: 'RATE_LIMIT',
        message: 'huodongxing events was rate limited by www.huodongxing.com',
        hint: 'Wait a few minutes and retry from a real browser session.',
      };
    }
    if (/系统加载中|当前访问人数过多|请休息片刻重试|不要频繁刷新|系统繁忙|系统忙|系统异常|服务异常|服务繁忙|访问失败|访问异常|页面出错|系统维护|error\s*code/i.test(pageText)) {
      return {
        ok: false,
        code: 'TRANSIENT_ACCESS',
        message: 'huodongxing events page returned a temporary busy/access page',
        hint: 'Huodongxing returned a temporary busy/access page instead of event cards. Wait and retry from the same browser session.',
      };
    }
    if (cards.length > 0) {
      return {
        ok: false,
        code: 'MALFORMED_RESULT',
        message: 'huodongxing events cards were found but no stable event rows could be extracted',
        hint: 'Huodongxing card markup changed: expected event links with /event/<id> and non-empty titles.',
      };
    }
    return {
      ok: false,
      code: 'EMPTY_RESULT',
      message: 'huodongxing events returned no data',
      hint: 'No Huodongxing event cards were found. The page may be empty or the DOM structure may have changed.',
    };
  }
  return { ok: true, rows };
}

function isTransientAccessPayload(result) {
  return unwrapEvaluateResult(result)?.code === 'TRANSIENT_ACCESS';
}

function requireExtractionRows(result) {
  const payload = unwrapEvaluateResult(result);
  if (payload?.ok === true && Array.isArray(payload.rows)) return payload.rows;
  if (payload?.ok === true) {
    throw new CommandExecutionError(
      'huodongxing events returned malformed extraction rows',
      'Expected browser extraction payload rows to be an array.',
    );
  }
  if (payload?.code === 'RATE_LIMIT') {
    throw new CommandExecutionError(
      payload.message || 'huodongxing events was rate limited by www.huodongxing.com',
      payload.hint || 'Wait a few minutes and retry from a real browser session.',
    );
  }
  if (payload?.code === 'TRANSIENT_ACCESS') {
    throw new CommandExecutionError(
      payload.message || 'huodongxing events page returned a temporary busy/access page',
      payload.hint || 'Wait and retry from the same browser session.',
    );
  }
  if (payload?.code === 'INVALID_LIMIT') {
    throw new ArgumentError(payload.message || 'huodongxing limit must be a positive integer <= 50');
  }
  if (payload?.code === 'EMPTY_RESULT') {
    throw new EmptyResultError(
      'huodongxing events',
      payload.hint || 'No Huodongxing event cards were found. The page may be empty.',
    );
  }
  throw new CommandExecutionError(
    payload?.message || 'huodongxing events returned malformed extraction data',
    payload?.hint || 'Huodongxing extraction did not return the expected structured payload.',
  );
}

export function extractEventRows(limit = 20) {
  return requireExtractionRows(extractEventRowsPayload(limit));
}

async function extractEventRowsFromPage(page, limit) {
  return page.evaluate(`(${extractEventRowsPayload.toString()})(${limit})`);
}

async function waitForEventCards(page) {
  await page.wait({ selector: RESULT_CARD_SELECTOR, timeout: 10 }).catch(async () => {
    await page.wait({ time: 1 });
  });
}

async function navigateAndExtractEventRowsPayload(page, url, limit) {
  await page.goto(url, { settleMs: 5000 });
  await waitForEventCards(page);
  return extractEventRowsFromPage(page, limit);
}

export const command = cli({
  site: 'huodongxing',
  name: 'events',
  access: 'read',
  description: '活动行活动搜索（按标签、城市/区域、日期、线上/线下、名称过滤）',
  domain: 'www.huodongxing.com',
  strategy: Strategy.PUBLIC,
  browser: true,
  args: [
    { name: 'tag', type: 'string', default: '', help: '活动标签，例如 AI' },
    { name: 'city', type: 'string', default: '全部', help: '城市名（支持中英文，如 佛山/foshan、广州/guangzhou、深圳/shenzhen）' },
    { name: 'cities', type: 'string', default: '', help: '逗号分隔城市列表，例如 佛山,广州,深圳 或 foshan,guangzhou,shenzhen' },
    { name: 'region', type: 'string', default: '', help: '区域预设，例如 gba（广佛深）、yrd（江浙沪）、jjj（京津冀）、sw（成渝）' },
    { name: 'upcomingOnly', type: 'boolean', default: false, help: '仅返回今天及未来的活动' },
    { name: 'date', type: 'string', default: '', help: '开始日期，格式 YYYY-MM-DD' },
    { name: 'dateTo', type: 'string', default: '', help: '结束日期，格式 YYYY-MM-DD' },
    { name: 'eventType', type: 'int', default: undefined, help: '活动类型：1 线下，2 线上' },
    { name: 'qs', type: 'string', default: '', help: '按活动名称关键词过滤' },
    { name: 'limit', type: 'int', default: 20, help: '返回条数（1-50）' },
  ],
  columns: EVENTS_COLUMNS,
  func: async (page, args) => {
    const limit = requireLimit(args.limit);
    const cities = resolveCitiesList(args);
    if (cities.length > 1) {
      const perCityLimit = Math.min(MAX_LIMIT, Math.max(10, Math.ceil(limit / cities.length) + 5));
      const seen = new Set();
      const combined = [];
      for (const cityName of cities) {
        const url = buildEventsUrl({ ...args, city: cityName });
        let result = await navigateAndExtractEventRowsPayload(page, url, perCityLimit);
        if (isTransientAccessPayload(result)) {
          await waitForEventCards(page);
          result = await extractEventRowsFromPage(page, perCityLimit);
        }
        const rows = filterRowsByDateRange(requireExtractionRows(result), args);
        for (const row of rows) {
          if (!row?.id || seen.has(row.id)) continue;
          seen.add(row.id);
          combined.push(row);
        }
      }
      return combined.slice(0, limit).map((row, idx) => ({ ...row, rank: idx + 1 }));
    }

    const url = buildEventsUrl({ ...args, city: cities[0] });
    let result = await navigateAndExtractEventRowsPayload(page, url, limit);
    if (isTransientAccessPayload(result)) {
      await waitForEventCards(page);
      result = await extractEventRowsFromPage(page, limit);
    }
    return filterRowsByDateRange(requireExtractionRows(result), args);
  },
});
