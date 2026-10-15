/**
 * Pure, Deterministic HTML & Inline-JSON Parsers for Huodongxing (活动行)
 * Single Source of Truth (SSOT) shared across DirectClient, OpenCliClient, and Reconciler.
 */

const BASE_ORIGIN = 'https://www.huodongxing.com';

export function cleanText(value) {
  return decodeHtmlEntities(String(value ?? ''))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function decodeHtmlEntities(str) {
  if (!str) return '';
  return String(str)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

/**
 * Converts Microsoft JSON dates like "/Date(1793062800000)/" or ISO strings into ISO-8601.
 * @param {string|number|null|undefined} raw
 * @returns {string}
 */
export function parseMsJsonDate(raw) {
  if (raw == null || raw === '') return '';
  const text = String(raw).trim();
  const match = text.match(/\/Date\((-?\d+)(?:[+-]\d{4})?\)\//i);
  if (match) {
    const ms = Number(match[1]);
    if (Number.isFinite(ms)) {
      return new Date(ms).toISOString();
    }
  }
  return text;
}

/**
 * Balanced JSON literal extractor for inline `var <name> = {...}` or `[...]` in SSR HTML.
 * @param {string} html
 * @param {string|string[]} varNames
 * @returns {any}
 */
export function extractJsVarJson(html, varNames) {
  const names = Array.isArray(varNames) ? varNames : [varNames];
  const source = String(html ?? '');

  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:var|let|const)\\s+${escaped}\\s*=\\s*`, 'g');
    let match;
    while ((match = regex.exec(source)) !== null) {
      let idx = match.index + match[0].length;
      while (idx < source.length && /\s/.test(source[idx])) idx++;
      const openChar = source[idx];
      if (openChar !== '{' && openChar !== '[') continue;
      const closeChar = openChar === '{' ? '}' : ']';

      let depth = 0;
      let inString = false;
      let stringQuote = '';
      let escapedChar = false;
      let endIdx = -1;

      for (let i = idx; i < source.length; i++) {
        const ch = source[i];
        if (inString) {
          if (escapedChar) {
            escapedChar = false;
          } else if (ch === '\\') {
            escapedChar = true;
          } else if (ch === stringQuote) {
            inString = false;
          }
          continue;
        }
        if (ch === '"' || ch === "'") {
          inString = true;
          stringQuote = ch;
          continue;
        }
        if (ch === openChar) {
          depth++;
        } else if (ch === closeChar) {
          depth--;
          if (depth === 0) {
            endIdx = i + 1;
            break;
          }
        }
      }

      if (endIdx !== -1) {
        const rawSlice = source.slice(idx, endIdx);
        try {
          return JSON.parse(rawSlice);
        } catch {
          // Continue searching if non-JSON JS object expression
        }
      }
    }
  }
  return null;
}

/**
 * Extracts a simple string assignment `var <name> = "..."` from HTML.
 */
export function extractJsVarString(html, varName) {
  const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(html ?? '').match(
    new RegExp(`(?:var|let|const)\\s+${escaped}\\s*=\\s*(['"])([\\s\\S]*?)\\1`),
  );
  return match ? match[2] : '';
}

export function dateOrdinal(year, month, day) {
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

export function parseYmd(value) {
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

export const CITY_ALIAS_MAP = {
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
  zhongshan: '中山',
  zs: '中山',
  '中山市': '中山',
  '中山': '中山',
  huizhou: '惠州',
  '惠州市': '惠州',
  '惠州': '惠州',
  jiangmen: '江门',
  '江门市': '江门',
  '江门': '江门',
  zhaoqing: '肇庆',
  '肇庆市': '肇庆',
  '肇庆': '肇庆',
  hongkong: '香港',
  'hong kong': '香港',
  hk: '香港',
  '中国香港': '香港',
  '香港': '香港',
  macau: '澳门',
  macao: '澳门',
  mo: '澳门',
  '中国澳门': '澳门',
  '澳门': '澳门',
  shanghai: '上海',
  sh: '上海',
  '上海市': '上海',
  '上海': '上海',
  beijing: '北京',
  bj: '北京',
  peking: '北京',
  '北京市': '北京',
  '北京': '北京',
  hangzhou: '杭州',
  hz: '杭州',
  '杭州市': '杭州',
  '杭州': '杭州',
  suzhou: '苏州',
  szu: '苏州',
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

export const REGION_PRESETS = {
  gba: {
    id: 'gba',
    label: '广佛深 · 粤港澳大湾区核心（佛山 · 广州 · 深圳）',
    cities: ['佛山', '广州', '深圳'],
    aliases: [
      'gba',
      'prd',
      'bay-area',
      'greater-bay-area',
      'guangfoshen',
      'fgs',
      '广佛深',
      '珠三角',
      '大湾区',
      '粤港澳',
      '粤港澳大湾区',
      '华南',
    ],
  },
  'gba-full': {
    id: 'gba-full',
    label: '粤港澳大湾区全域（佛山 · 广州 · 深圳 · 东莞 · 珠海 · 香港）',
    cities: ['佛山', '广州', '深圳', '东莞', '珠海', '香港'],
    aliases: ['gba-full', 'gba-all', '大湾区全域'],
  },
  yrd: {
    id: 'yrd',
    label: '长三角 · 江浙沪（上海 · 杭州 · 苏州）',
    cities: ['上海', '杭州', '苏州'],
    aliases: ['yrd', 'yangtze', '长三角', '江浙沪', '华东'],
  },
  jjj: {
    id: 'jjj',
    label: '京津冀（北京 · 天津）',
    cities: ['北京', '天津'],
    aliases: ['jjj', 'north', '京津冀', '华北'],
  },
  sw: {
    id: 'sw',
    label: '成渝双城（成都 · 重庆）',
    cities: ['成都', '重庆'],
    aliases: ['sw', 'southwest', '成渝', '川渝', '西南'],
  },
};

export const DEFAULT_RECOMMEND_KEYWORDS = [
  'AI',
  'Agent',
  '智能体',
  '出海',
  '跨境',
  '亚马逊',
  'TikTok',
  'Wayfair',
  'DTC',
  '独立站',
  '饰品',
  '首饰',
  '时尚',
  '电商',
  '科技',
  '机器人',
  '创业',
  '峰会',
  '沙龙',
];

/**
 * Normalizes a city name (English, Pinyin, abbreviation, or Chinese) to Huodongxing's canonical city parameter.
 */
export function normalizeCityName(input) {
  const raw = cleanText(input);
  if (!raw) return '全部';
  const stripped = raw.replace(/^(?:广东|北京|上海|浙江|江苏|四川|湖北|陕西|山东|福建|天津|重庆)(?:省|市)?/, '');
  const candidate = stripped || raw;
  const lower = candidate.toLowerCase();
  if (CITY_ALIAS_MAP[lower]) return CITY_ALIAS_MAP[lower];
  if (CITY_ALIAS_MAP[candidate]) return CITY_ALIAS_MAP[candidate];
  if (CITY_ALIAS_MAP[raw.toLowerCase()]) return CITY_ALIAS_MAP[raw.toLowerCase()];
  if (CITY_ALIAS_MAP[raw]) return CITY_ALIAS_MAP[raw];
  if (candidate.length >= 3 && candidate.endsWith('市')) {
    const withoutShi = candidate.slice(0, -1);
    if (CITY_ALIAS_MAP[withoutShi]) return CITY_ALIAS_MAP[withoutShi];
    return withoutShi;
  }
  return candidate;
}

function findRegionPreset(token) {
  const clean = cleanText(token).toLowerCase();
  if (!clean) return null;
  for (const preset of Object.values(REGION_PRESETS)) {
    if (preset.id === clean || preset.aliases.some((a) => a.toLowerCase() === clean)) {
      return preset;
    }
  }
  return null;
}

/**
 * Checks whether a single token is a recognized city alias, canonical Chinese city, or region preset.
 */
export function isKnownCityOrRegionToken(token) {
  const raw = cleanText(token);
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (findRegionPreset(raw)) return true;
  if (CITY_ALIAS_MAP[lower] || CITY_ALIAS_MAP[raw]) return true;
  if (raw.length >= 3 && raw.endsWith('市')) {
    const stripped = raw.slice(0, -1);
    if (CITY_ALIAS_MAP[stripped] || /^[\u4e00-\u9fa5]{2,4}$/.test(stripped)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether an input string (single token or comma-separated list) represents cities/regions
 * rather than a free-text search keyword.
 */
export function isCityOrRegionInput(input) {
  const raw = cleanText(input);
  if (!raw) return false;
  if (findRegionPreset(raw)) return true;
  const tokens = raw
    .split(/[,，、;/|\s]+/)
    .map((t) => cleanText(t))
    .filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.every((tok) => isKnownCityOrRegionToken(tok));
}

/**
 * Resolves `--cities`, `--city`, or `--region` into a canonical deduplicated city list and metadata.
 * Explicit `cities` / `city` takes precedence over `region` preset when both are provided.
 */
export function resolveRegionOrCities(options = {}, fallbackCities = ['佛山', '广州', '深圳']) {
  const rawRegion = options.region;
  const rawCities = options.cities ?? options.city;

  if (rawCities !== undefined && rawCities !== null && cleanText(Array.isArray(rawCities) ? rawCities.join(',') : rawCities) !== '') {
    const tokens = Array.isArray(rawCities)
      ? rawCities.flatMap((c) => String(c).split(/[,，、;/|\s]+/))
      : String(rawCities).split(/[,，、;/|\s]+/);
    const expanded = [];
    for (const tok of tokens.map((t) => cleanText(t)).filter(Boolean)) {
      const p = findRegionPreset(tok);
      if (p) expanded.push(...p.cities);
      else expanded.push(normalizeCityName(tok));
    }
    const deduped = Array.from(new Set(expanded.filter(Boolean)));
    if (deduped.length > 0) {
      return {
        regionId: deduped.join(',') === '佛山,广州,深圳' ? 'gba' : 'custom_cities',
        regionLabel:
          deduped.join(',') === '佛山,广州,深圳'
            ? REGION_PRESETS.gba.label
            : `指定城市群 (${deduped.join(' · ')})`,
        cities: deduped,
        source: 'cli_cities',
      };
    }
  }

  if (rawRegion && typeof rawRegion === 'string' && cleanText(rawRegion)) {
    const preset = findRegionPreset(rawRegion);
    if (preset) {
      return {
        regionId: preset.id,
        regionLabel: preset.label,
        cities: [...preset.cities],
        source: 'region_preset',
      };
    }
    const tokens = String(rawRegion)
      .split(/[,，、;/|\s]+/)
      .map((t) => cleanText(t))
      .filter(Boolean);
    const expanded = [];
    for (const tok of tokens) {
      const p = findRegionPreset(tok);
      if (p) expanded.push(...p.cities);
      else expanded.push(normalizeCityName(tok));
    }
    const deduped = Array.from(new Set(expanded.filter(Boolean)));
    if (deduped.length > 0) {
      return {
        regionId: 'custom',
        regionLabel: `自定义区域 (${deduped.join(' · ')})`,
        cities: deduped,
        source: 'cli_region_list',
      };
    }
  }

  const fbTokens = Array.isArray(fallbackCities)
    ? fallbackCities
    : String(fallbackCities || '佛山,广州,深圳').split(/[,，、;/|\s]+/);
  const normalizedFallback = Array.from(
    new Set(fbTokens.map((c) => normalizeCityName(c)).filter(Boolean))
  );
  const finalCities = normalizedFallback.length > 0 ? normalizedFallback : ['佛山', '广州', '深圳'];

  return {
    regionId: finalCities.join(',') === '佛山,广州,深圳' ? 'gba' : 'configured_default',
    regionLabel:
      finalCities.join(',') === '佛山,广州,深圳'
        ? REGION_PRESETS.gba.label
        : `默认区域 (${finalCities.join(' · ')})`,
    cities: finalCities,
    source: options.configSource || 'operator_default',
  };
}

/**
 * Builds the canonical Huodongxing `/events` search URL.
 * Fixes the upstream OpenCLI bug where `d=ts` was passed unconditionally on empty dates,
 * causing Huodongxing's backend to return HTTP 500.
 * Normalizes bilingual city names (e.g. `foshan` -> `佛山`, `guangzhou` -> `广州`, `shenzhen` -> `深圳`).
 */
export function buildEventsUrl(args = {}) {
  const date = cleanText(args.date || '');
  const dateTo = cleanText(args.dateTo || '');
  if (date && parseYmd(date) == null) {
    throw new Error('huodongxing date must be a valid YYYY-MM-DD date');
  }
  if (dateTo && parseYmd(dateTo) == null) {
    throw new Error('huodongxing dateTo must be a valid YYYY-MM-DD date');
  }
  if (date && dateTo && parseYmd(date) > parseYmd(dateTo)) {
    throw new Error('huodongxing date must be <= dateTo');
  }

  const params = new URLSearchParams();
  params.set('orderby', cleanText(args.orderby) || 'o');
  if (date || dateTo) {
    params.set('d', 'ts');
    if (date) params.set('date', date);
    if (dateTo) params.set('dateTo', dateTo);
  } else if (args.d) {
    params.set('d', cleanText(args.d));
  }
  if (cleanText(args.tag)) params.set('tag', cleanText(args.tag));
  params.set('city', normalizeCityName(args.city));

  const eventType = cleanText(args.eventType);
  if (eventType) {
    if (eventType !== '1' && eventType !== '2') {
      throw new Error('huodongxing eventType must be 1 (offline) or 2 (online)');
    }
    params.set('eventType', eventType);
  }
  const keyword = cleanText(args.qs ?? args.keyword ?? '');
  if (keyword) params.set('qs', keyword);
  const status = cleanText(args.status);
  if (status) {
    params.set('status', status);
  } else if (args.upcomingOnly) {
    params.set('status', '1');
  }
  const page = Number(args.page || 1);
  if (Number.isInteger(page) && page > 1) {
    params.set('page', String(page));
  }
  return `${BASE_ORIGIN}/events?${params.toString()}`;
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

const WEEKDAY_INDEX = {
  '周日': 0, '周天': 0, '星期日': 0, '星期天': 0,
  '周一': 1, '星期一': 1,
  '周二': 2, '星期二': 2,
  '周三': 3, '星期三': 3,
  '周四': 4, '星期四': 4,
  '周五': 5, '星期五': 5,
  '周六': 6, '星期六': 6,
};

export function parseEventTimeRange(timeText, options = {}) {
  const rawText = cleanText(timeText);
  if (!rawText) return null;
  const text = rawText
    .replace(/(\d{4})[年.](\d{1,2})[月.](\d{1,2})日?/g, '$1/$2/$3')
    .replace(/(\d{1,2})月(\d{1,2})日?/g, '$1/$2')
    .replace(/(\d{1,2})\.(\d{1,2})/g, '$1/$2');

  const filterStart = parseYmd(options.date);
  const filterEnd = parseYmd(options.dateTo) ?? filterStart;
  const referenceDate = options.referenceDate instanceof Date ? options.referenceDate : new Date();
  const curYear = referenceDate.getFullYear();
  const curMonth = referenceDate.getMonth() + 1;
  const referenceOrdinal = dateOrdinal(
    curYear,
    curMonth,
    referenceDate.getDate(),
  );

  if (/今天/.test(text)) return { start: referenceOrdinal, end: referenceOrdinal, referenceOrdinal, isExpired: false };
  if (/明天/.test(text)) return { start: referenceOrdinal + 1, end: referenceOrdinal + 1, referenceOrdinal, isExpired: false };
  if (/后天/.test(text)) return { start: referenceOrdinal + 2, end: referenceOrdinal + 2, referenceOrdinal, isExpired: false };

  const explicitYearInTime = text.match(/(\d{4})[/-]\d{1,2}[/-]\d{1,2}/);
  const explicitYearInTitle = cleanText(options.title || '').match(/(\b|【|\[|\s)(201\d|202\d)年?/);
  const explicitYear = explicitYearInTime
    ? Number(explicitYearInTime[1])
    : explicitYearInTitle
      ? Number(explicitYearInTitle[2])
      : options.year != null
        ? Number(options.year)
        : cleanText(options.date).match(/^(\d{4})-/)?.[1]
          ? Number(cleanText(options.date).slice(0, 4))
          : null;

  const baseYear = explicitYear || curYear;

  const tokenRegex = /(?:(\d{4})[/-])?(\d{1,2})[/-](\d{1,2})(?:\s*[(（]?\s*([周星期][日天一二三四五六])\s*[)）]?)?/g;
  const matches = Array.from(text.matchAll(tokenRegex));
  if (matches.length === 0) return null;

  const parsedTokens = [];
  for (const m of matches) {
    const tokenYear = m[1] ? Number(m[1]) : explicitYear;
    const month = Number(m[2]);
    const day = Number(m[3]);
    const weekdayStr = m[4];
    const targetW = weekdayStr ? WEEKDAY_INDEX[weekdayStr] : null;

    let resolvedYear = tokenYear;
    if (!resolvedYear && targetW != null) {
      const candidates = [curYear, curYear + 1, curYear - 1, curYear - 2, curYear - 3, curYear - 4, curYear - 5];
      for (const candY of candidates) {
        if (new Date(candY, month - 1, day).getDay() === targetW) {
          resolvedYear = candY;
          break;
        }
      }
    }

    if (!resolvedYear) {
      if (!explicitYear && curMonth >= 10 && month <= 2 && options.year == null) {
        resolvedYear = curYear + 1;
      } else {
        resolvedYear = baseYear;
      }
    }

    parsedTokens.push({
      year: resolvedYear,
      month,
      day,
      ordinal: dateOrdinal(resolvedYear, month, day),
    });
  }

  const startToken = parsedTokens[0];
  let endToken = parsedTokens[parsedTokens.length - 1];

  if (parsedTokens.length > 1 && endToken.month < startToken.month && endToken.year <= startToken.year) {
    const nextY = startToken.year + 1;
    endToken = {
      ...endToken,
      year: nextY,
      ordinal: dateOrdinal(nextY, endToken.month, endToken.day),
    };
  }

  if (filterStart != null && endToken.ordinal < filterStart && startToken.month >= 10 && !explicitYear) {
    const nextStartYear = baseYear + 1;
    const nextEndYear = endToken.month < startToken.month ? nextStartYear + 1 : nextStartYear;
    const nextStartOrd = dateOrdinal(nextStartYear, startToken.month, startToken.day);
    const nextEndOrd = dateOrdinal(nextEndYear, endToken.month, endToken.day);
    return {
      start: nextStartOrd,
      end: nextEndOrd,
      referenceOrdinal,
      isExpired: nextEndOrd < referenceOrdinal,
    };
  }

  const start = startToken.ordinal;
  const end = endToken.ordinal;
  return {
    start,
    end,
    referenceOrdinal,
    isExpired: end < referenceOrdinal,
  };
}

export function filterRowsByDateRange(rows, options = {}) {
  const filterStart = parseYmd(options.date);
  const filterEnd = parseYmd(options.dateTo) ?? filterStart;
  const upcomingOnly = Boolean(options.upcomingOnly);
  if (filterStart == null && filterEnd == null && !upcomingOnly) {
    return rows.map((row, idx) => ({ ...row, rank: idx + 1 }));
  }

  const referenceDate = options.referenceDate instanceof Date ? options.referenceDate : new Date();
  const todayOrdinal = dateOrdinal(
    referenceDate.getFullYear(),
    referenceDate.getMonth() + 1,
    referenceDate.getDate(),
  );

  const start = filterStart ?? filterEnd;
  const end = filterEnd ?? filterStart;
  const filtered = rows.filter((row) => {
    const range = parseEventTimeRange(row.time, { ...options, title: row.title, referenceDate });
    if (!range) return !upcomingOnly;
    if (upcomingOnly && range.end < todayOrdinal) {
      return false;
    }
    if (start != null && end != null) {
      return range.start <= end && range.end >= start;
    }
    return true;
  });
  return filtered.map((row, idx) => ({ ...row, rank: idx + 1 }));
}

function normalizeUrl(href) {
  const raw = decodeHtmlEntities(String(href ?? '')).trim();
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  if (raw.startsWith('/')) return `${BASE_ORIGIN}${raw}`;
  return `${BASE_ORIGIN}/${raw}`;
}

/**
 * Checks if an HTML payload is a Geetest WAF challenge or server error page.
 */
export function detectWafOrErrorHtml(html) {
  const text = String(html ?? '');
  if (/verify\.huodongxing\.com\/gt3|哎呀，访问太快了|系统需要确认你是真人/i.test(text)) {
    return {
      blocked: true,
      code: 'WAF_RATE_LIMIT',
      message: 'Triggered Huodongxing OpenResty/Geetest v3 rate-limit page (verify.huodongxing.com/gt3).',
    };
  }
  if (/抱歉，出错了|error-500\.png|Error\s*500/i.test(text) && !/search-tab-content-item-mesh|ativityJson|mUserState/.test(text)) {
    return {
      blocked: true,
      code: 'BACKEND_HTTP_500',
      message: 'Huodongxing backend returned an application error page (HTTP 500).',
    };
  }
  return { blocked: false, code: null, message: null };
}

/**
 * Parses `/events` or `/` HTML into structured event rows.
 * Scopes `.item-dress` strictly so static platform promo banners (which have empty `.item-dress`)
 * are filtered out instead of leaking across `</div>` into `.user-name`.
 */
export function parseEventsHtml(html, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit || 20), 1), 100);
  const source = String(html ?? '');
  const parts = source.split(/<div[^>]*class=["'][^"']*search-tab-content-item-mesh[^"']*["'][^>]*>/i).slice(1);

  const rows = [];
  const seen = new Set();

  for (const rawBlock of parts) {
    const block = rawBlock.split(/<\/div>\s*<\/div>\s*<\/div>/i)[0] || rawBlock.slice(0, 4000);
    const idMatch = block.match(/href=["'][^"']*\/event\/(\d+)[^"']*["']/i);
    const id = idMatch ? idMatch[1] : '';
    if (!id || seen.has(id)) continue;

    const titleLinkMatch = block.match(/<a[^>]*class=["'][^"']*item-title[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    const imgAltMatch = block.match(/<img[^>]*class=["'][^"']*item-logo[^"']*["'][^>]*alt=["']([^"']+)["']/i);
    const title = cleanText(titleLinkMatch?.[1]) || cleanText(imgAltMatch?.[1]) || '';
    if (!title) continue;

    const dressBlockMatch = block.match(/<div[^>]*class=["'][^"']*item-dress\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    const dressBlock = dressBlockMatch ? dressBlockMatch[1] : '';

    const timeMatch = dressBlock.match(/<p(?![^>]*class=["'][^"']*item-dress-pp)[^>]*>([\s\S]*?)<\/p>/i);
    const time = cleanText(timeMatch?.[1] || '');

    const locMatch = dressBlock.match(/class=["'][^"']*item-dress-pp[^"']*["'][^>]*>([\s\S]*?)<\//i)
      || block.match(/class=["'][^"']*item-dress-pp[^"']*["'][^>]*>([\s\S]*?)<\//i);
    const location = cleanText(locMatch?.[1] || '');

    // Skip static platform promotional banners that have neither event time nor location
    if (!time && !location && !options.includePromos) {
      continue;
    }

    const orgMatch = block.match(/class=["'][^"']*user-name[^"']*["'][^>]*>([\s\S]*?)<\//i)
      || block.match(/item-bottom-left[\s\S]*?<img[^>]*title=["']([^"']+)["']/i);
    const organizer = cleanText(orgMatch?.[1] || '');

    const isOnline = /item-live-icon/.test(block) || /线上|在线|直播/.test(location);
    const isOffline = /item-dress-icon/.test(block);
    const eventType = isOnline ? 'online' : isOffline ? 'offline' : 'offline';
    const isFeatured = /优选/.test(block);

    seen.add(id);
    rows.push({
      rank: rows.length + 1,
      id,
      title,
      time,
      eventType,
      city: location,
      location,
      organizer,
      isFeatured,
      url: `${BASE_ORIGIN}/event/${id}`,
    });
  }

  return filterRowsByDateRange(rows, options).slice(0, limit).map((row, idx) => ({
    ...row,
    rank: idx + 1,
  }));
}

/**
 * Scores, deduplicates, and ranks multi-city events for regional recommendation (`hdx recommend`).
 */
export function scoreAndRankRegionalEvents(rawItemsByCity = {}, options = {}) {
  const cities = Array.isArray(options.cities) && options.cities.length > 0
    ? options.cities
    : ['佛山', '广州', '深圳'];
  const hasExplicitKeywords = Array.isArray(options.keywords)
    ? options.keywords.length > 0
    : Boolean(cleanText(options.keywords || ''));
  const rawKeywords = hasExplicitKeywords ? options.keywords : DEFAULT_RECOMMEND_KEYWORDS;
  const keywords = (Array.isArray(rawKeywords)
    ? rawKeywords
    : String(rawKeywords).split(/[,，、;/|\s]+/)
  )
    .map((k) => cleanText(k))
    .filter(Boolean);

  const upcomingOnly = options.upcomingOnly !== false;
  const limit = Math.min(Math.max(Number(options.limit || 20), 1), 100);
  const perCityLimit = Math.min(Math.max(Number(options.perCityLimit || 8), 1), 50);

  const referenceDate = options.referenceDate instanceof Date ? options.referenceDate : new Date();
  const todayOrdinal = dateOrdinal(
    referenceDate.getFullYear(),
    referenceDate.getMonth() + 1,
    referenceDate.getDate(),
  );

  let totalFetched = 0;
  let pastFilteredOut = 0;
  let duplicatesRemoved = 0;

  const seenIds = new Set();
  const scoredAll = [];
  const byCity = {};
  const byCityCounts = {};

  for (let cityIdx = 0; cityIdx < cities.length; cityIdx++) {
    const cityName = cities[cityIdx];
    const cityItems = rawItemsByCity[cityName] || [];
    totalFetched += cityItems.length;
    byCity[cityName] = [];

    for (const item of cityItems) {
      if (!item || !item.id) continue;
      const range = parseEventTimeRange(item.time, { ...options, referenceDate, title: item.title });
      if (upcomingOnly && range && range.end < todayOrdinal) {
        pastFilteredOut += 1;
        continue;
      }

      if (seenIds.has(item.id)) {
        duplicatesRemoved += 1;
        continue;
      }
      seenIds.add(item.id);

      const daysFromNow = range ? Math.max(0, range.start - todayOrdinal) : null;
      const hay = `${item.title || ''} ${item.organizer || ''} ${item.location || ''}`;
      const hayLower = hay.toLowerCase();
      const matchedTags = [];
      for (const kw of keywords) {
        if (/^[a-z0-9]+$/i.test(kw)) {
          const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const re = new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, 'i');
          if (re.test(hay)) matchedTags.push(kw);
        } else if (hayLower.includes(kw.toLowerCase())) {
          matchedTags.push(kw);
        }
      }

      // Deterministic scoring model:
      // 1. Regional city priority base score (preserves user's preferred city order)
      const cityBaseScore = Math.max(20, 30 - cityIdx * 2);
      // 2. Keyword/theme match boost (+15 per matched tag, capped at +45)
      const keywordScore = Math.min(45, matchedTags.length * 15);
      // 3. Proximity boost (+12 if within 7 days, +8 if within 21 days, +4 if within 45 days)
      const proximityScore =
        daysFromNow == null
          ? 0
          : daysFromNow <= 7
            ? 12
            : daysFromNow <= 21
              ? 8
              : daysFromNow <= 45
                ? 4
                : 1;
      // 4. Offline local presence boost (+6 for offline in-city vs online)
      const offlineScore = item.eventType === 'offline' ? 6 : 0;
      // 5. Featured boost
      const featuredScore = item.isFeatured ? 5 : 0;

      const recommendScore = cityBaseScore + keywordScore + proximityScore + offlineScore + featuredScore;

      const enriched = {
        ...item,
        matchedCity: cityName,
        daysFromNow,
        matchedTags,
        recommendScore,
      };
      scoredAll.push(enriched);
      byCity[cityName].push(enriched);
    }

    byCity[cityName].sort((a, b) => {
      if (b.recommendScore !== a.recommendScore) return b.recommendScore - a.recommendScore;
      return (a.daysFromNow ?? 999) - (b.daysFromNow ?? 999);
    });
    byCityCounts[cityName] = byCity[cityName].length;
    byCity[cityName] = byCity[cityName].slice(0, perCityLimit).map((row, idx) => ({
      ...row,
      cityRank: idx + 1,
    }));
  }

  scoredAll.sort((a, b) => {
    if (b.recommendScore !== a.recommendScore) return b.recommendScore - a.recommendScore;
    return (a.daysFromNow ?? 999) - (b.daysFromNow ?? 999);
  });

  const rankedItems = scoredAll.slice(0, limit).map((row, idx) => ({
    ...row,
    rank: idx + 1,
  }));

  return {
    stats: {
      totalFetched,
      pastFilteredOut,
      duplicatesRemoved,
      recommendedCount: rankedItems.length,
      byCityCounts,
    },
    byCity,
    items: rankedItems,
  };
}

/**
 * Parses `/event/<id>` HTML and inline SSR JSON (`ativityJson`, `eventTicketsJson`, `formItemsJson`).
 */
export function parseEventDetailHtml(html, fallbackId = '') {
  const source = String(html ?? '');
  const activity = extractJsVarJson(source, ['ativityJson', 'activityJson']) || {};
  const rawTickets = extractJsVarJson(source, ['eventTicketsJson']) || activity.ActivityTickets || [];
  const rawFormItems = extractJsVarJson(source, ['formItemsJson']) || [];
  const regWebTokenName = extractJsVarString(source, 'regWebTokenName');
  const regWebTokenValue = extractJsVarString(source, 'regWebTokenValue');

  const titleMatch = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const id = String(activity.Id || fallbackId || '').trim();
  const title = cleanText(activity.Title || titleMatch?.[1]?.replace(/-活动行.*$/, '') || '');

  const tickets = Array.isArray(rawTickets)
    ? rawTickets.map((t, index) => ({
        sn: t.SN ?? index + 1,
        title: cleanText(t.Title || '默认票种'),
        price: typeof t.Price === 'number' ? t.Price : Number(t.Price || 0),
        priceStr: cleanText(t.PriceStr || (t.Price ? `¥${t.Price}` : '免费')),
        currency: cleanText(t.Currency || 'RMB'),
        quantity: t.Quantity ?? null,
        soldNumber: t.SoldNumber ?? 0,
        needApply: Boolean(t.NeedApply),
        enabled: t.Enabled !== false,
        statusStr: cleanText(t.StatusStr || ''),
        bookPeriodStr: cleanText(t.BookPeriodStr || ''),
        description: cleanText(t.Description || ''),
        minOrder: t.MinOrder ?? 1,
        maxOrder: t.MaxOrder ?? 1,
      }))
    : [];

  const formItems = Array.isArray(rawFormItems)
    ? rawFormItems.map((f) => ({
        key: cleanText(f.Key || ''),
        title: cleanText(f.Title || ''),
        type: cleanText(f.Type || 'text'),
        required: Boolean(f.Required),
        description: cleanText(f.Description || ''),
        options: Array.isArray(f.Subitems) ? f.Subitems.map((s) => cleanText(s)) : [],
      }))
    : [];

  const organizers = Array.isArray(activity.Organizers)
    ? activity.Organizers.map((o) => ({
        id: cleanText(o.Id || o.OrgId || ''),
        name: cleanText(o.Name || ''),
        type: o.Type ?? 0,
        contactPhone: cleanText(o.ContactPhone || ''),
        contactEmail: cleanText(o.ContactEmail || ''),
        followers: o.Follows ?? 0,
        eventsCount: o.Events ?? 0,
        subdomain: cleanText(o.Subdomain || ''),
      }))
    : [];

  return {
    id,
    title,
    startTime: parseMsJsonDate(activity.Start) || cleanText(activity.StartShort || ''),
    endTime: parseMsJsonDate(activity.End) || cleanText(activity.EndShort || ''),
    startShort: cleanText(activity.StartShort || ''),
    endShort: cleanText(activity.EndShort || ''),
    province: cleanText(activity.Setting?.Province || ''),
    city: cleanText(activity.City || ''),
    address: cleanText(activity.Address || ''),
    fullAddress: cleanText(
      [activity.Setting?.Province, activity.City, activity.Address].filter(Boolean).join(' '),
    ),
    tags: cleanText(activity.Tag || '').split(/[,\s]+/).filter(Boolean),
    category: activity.Category ?? null,
    status: activity.Status ?? null,
    isFree: Boolean(activity.IsFree ?? tickets.every((t) => t.price === 0)),
    maxAttendees: activity.MaxInstance ?? null,
    registeredCount: activity.InstanceNumber ?? 0,
    favoriteCount: activity.Follows ?? 0,
    viewCount: activity.VisitNumber ?? 0,
    summary: cleanText(activity.Setting?.Summary || ''),
    organizers,
    tickets,
    formItems,
    registrationToken: {
      name: regWebTokenName,
      present: Boolean(regWebTokenValue),
    },
    url: id ? `${BASE_ORIGIN}/event/${id}` : '',
  };
}

/**
 * Parses `mUserState` and `currentUser`/`currenUser` from any authenticated page.
 */
export function parseUserStateHtml(html) {
  const source = String(html ?? '');
  const mUserState = extractJsVarJson(source, ['mUserState']) || {};
  const consoleUser = extractJsVarJson(source, ['currentUser', 'currenUser']) || {};
  const qrpathRaw = extractJsVarString(source, 'qrpath');

  const userId = cleanText(mUserState.UserId || consoleUser.Account || '');
  const name = cleanText(mUserState.Name || consoleUser.Nick || consoleUser.RealName || '');
  const realName = cleanText(consoleUser.RealName || mUserState.Name || '');
  const nick = cleanText(consoleUser.Nick || mUserState.Name || '');
  const phone = cleanText(mUserState.Phone || consoleUser.Phone || '');
  const email = cleanText(mUserState.Email || consoleUser.Email || '');
  const brief = cleanText(consoleUser.Brief || '');

  return {
    authenticated: Boolean(userId && userId !== '0'),
    userId,
    name,
    nick,
    realName,
    brief,
    phone,
    email,
    avatar: cleanText(mUserState.Logo || consoleUser.Logo || ''),
    isWeixin: Boolean(mUserState.IsWeixin ?? consoleUser.IsWeixin),
    vipRank: mUserState.VipRank ?? consoleUser.VipRank ?? 0,
    authType: mUserState.AuthType ?? -1,
    lastLogin: cleanText(mUserState.LastLoginDate || consoleUser.LastLogin || ''),
    myTicketsQrUrl: qrpathRaw ? decodeURIComponent(qrpathRaw) : '',
  };
}

/**
 * Parses `/user/index` or `/user/followandregevents` timeline items.
 */
export function parseTimelineHtml(html, limit = 50) {
  const source = String(html ?? '');
  const items = [];
  const seen = new Set();

  // Extract timeline block or inspect full HTML if AJAX fragment
  const timelineScopeMatch = source.match(/<ul[^>]*class=["'][^"']*user-event-timeline[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div[^>]*id=["']timeline_loading/i);
  const scope = timelineScopeMatch ? timelineScopeMatch[1] : source;

  // Match each media card `<a class="media" href="/event/...">...</a>`
  const cardRegex = /<li[^>]*>\s*<a[^>]*class=["'][^"']*media[^"']*["'][^>]*href=["']([^"']*\/event\/(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>\s*<\/li>/gi;
  let match;
  while ((match = cardRegex.exec(scope)) !== null) {
    if (items.length >= limit) break;
    const href = match[1];
    const id = match[2];
    const inner = match[3];
    const key = `${id}-${items.length}`;
    if (seen.has(key)) continue;

    // Look backwards up to 600 chars before match.index for date group header `<div>Wednesday, ...</div>`
    const prefix = scope.slice(Math.max(0, match.index - 800), match.index);
    const dateHeaders = [...prefix.matchAll(/<li[^>]*>\s*<div>([^<]+)<\/div>/gi)];
    const dateGroup = dateHeaders.length > 0 ? cleanText(dateHeaders[dateHeaders.length - 1][1]) : '';

    const actionType = /user-event-label-signup/i.test(inner)
      ? 'signup'
      : /user-event-label-favorite/i.test(inner)
        ? 'favorite'
        : 'activity';
    const actionLabel = actionType === 'signup' ? '报名' : actionType === 'favorite' ? '收藏' : '动态';

    const titleMatch = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const title = cleanText(titleMatch?.[1] || '');

    const imgMatch = inner.match(/<img[^>]*src=["']([^"']+)["']/i);
    const logo = normalizeUrl(imgMatch?.[1] || '');

    const timeMatch = inner.match(/icon-time[^>]*><\/i>\s*([^<]+)/i);
    const placeMatch = inner.match(/icon-place[^>]*><\/i>\s*([^<]+)/i);

    seen.add(key);
    items.push({
      rank: items.length + 1,
      id,
      title,
      actionType,
      actionLabel,
      dateGroup,
      time: cleanText(timeMatch?.[1] || ''),
      location: cleanText(placeMatch?.[1] || ''),
      logo,
      url: normalizeUrl(href),
    });
  }

  return items;
}

/**
 * Parses `/user/regevents` HTML including all 4 status tabs and embedded `<textarea id="ticket_print_span_*">` e-tickets.
 */
export function parseTicketsHtml(html, options = {}) {
  const source = String(html ?? '');
  const statusFilter = cleanText(options.status || 'all').toLowerCase();

  const paneDefs = [
    { paneId: 'user-ticket-success', statusKey: 'valid', statusLabel: '有效票' },
    { paneId: 'user-ticket-undone', statusKey: 'undone', statusLabel: '未完成' },
    { paneId: 'user-ticket-abort', statusKey: 'cancelled', statusLabel: '已取消' },
    { paneId: 'user-ticket-refund', statusKey: 'refund', statusLabel: '退票申请' },
  ];

  const parseCount = (id) => {
    const m = source.match(new RegExp(`href=["']#${id}["'][^>]*>([\\s\\S]*?<\\/a>)`, 'i'));
    if (!m) return 0;
    const num = m[1].match(/\d+/);
    return num ? Number(num[0]) : 0;
  };

  // Parse tab header counts
  const counts = {
    valid: parseCount('user-ticket-success'),
    undone: parseCount('user-ticket-undone'),
    cancelled: parseCount('user-ticket-abort'),
    refund: parseCount('user-ticket-refund'),
  };

  const tickets = [];

  for (const pane of paneDefs) {
    if (statusFilter !== 'all' && statusFilter !== pane.statusKey) continue;

    const paneRegex = new RegExp(
      `<div[^>]*id=["']${pane.paneId}["'][^>]*>([\\s\\S]*?)(?=<div[^>]*class=["']tab-pane|<div[^>]*class=["']aside|$)`,
      'i',
    );
    const paneHtml = source.match(paneRegex)?.[1] || '';
    if (!paneHtml) continue;

    const itemBlocks = paneHtml.split(/<li\b[^>]*>/i).slice(1);
    for (const block of itemBlocks) {
      const eventLinkMatch = block.match(/<h3[^>]*>\s*<a[^>]*href=["']([^"']*\/event\/(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);
      const eventUrl = normalizeUrl(eventLinkMatch?.[1] || '');
      const eventId = eventLinkMatch?.[2] || '';
      const eventTitle = cleanText(eventLinkMatch?.[3] || '');
      if (!eventId && !eventTitle) continue;

      const timeMatch = block.match(/<div[^>]*class=["'][^"']*time[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
      const rawTimeText = cleanText(timeMatch?.[1] || '');
      const eventTime = cleanText(rawTimeText.replace(/^活动时间：/, '').replace(/(即将开始|已经结束|进行中)$/, ''));
      const timeBadge = rawTimeText.match(/(即将开始|已经结束|进行中)/)?.[1] || '';

      const tidMatch = block.match(/\/user\/tikcets\?tids=(\d+)/i)
        || block.match(/id=["']ticket_print_span_(\d+)["']/i);
      const ticketNo = tidMatch ? tidMatch[1] : '';

      // Extract embedded e-ticket print span if present
      const printSpanMatch = block.match(/<textarea[^>]*id=["']ticket_print_span_\d+["'][^>]*>([\s\S]*?)<\/textarea>/i);
      const printHtml = printSpanMatch ? decodeHtmlEntities(printSpanMatch[1]) : '';

      const qrMatch = printHtml.match(/src=["']([^"']*\/qrcode\/[^"']+)["']/i);
      const signupTimeMatch = printHtml.match(/报名时间：([^<]+)/i);
      const timeRangeMatch = printHtml.match(/icon-time[^>]*><\/i>\s*([^<]+)/i);
      const venueMatch = printHtml.match(/icon-place[^>]*><\/i>\s*([^<]+)/i);
      const printParagraphs = [...printHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => cleanText(m[1]));

      // Extract table cells inside printHtml or main table
      const printCells = [...printHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cleanText(m[1]));
      const mainRowCells = [...block.matchAll(/<tbody[^>]*>[\s\S]*?<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
      const firstRowTds = mainRowCells[0]
        ? [...mainRowCells[0][1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cleanText(m[1]))
        : [];

      const refundTokenMatch = block.match(/refundMyTicket\(\s*['"]([^'"]+)['"]/i);

      tickets.push({
        rank: tickets.length + 1,
        ticketNo: ticketNo || printParagraphs[0] || '',
        eventId,
        eventTitle,
        eventTime,
        timeRange: cleanText(timeRangeMatch?.[1] || printParagraphs[1] || eventTime),
        timeBadge,
        venue: cleanText(venueMatch?.[1] || printParagraphs[2] || ''),
        ticketTitle: printParagraphs[7] || firstRowTds[0] || printCells[2] || '免费票',
        quantity: Number(firstRowTds[1] || 1),
        price: printParagraphs[6] || firstRowTds[2] || printCells[3] || '免费',
        statusKey: pane.statusKey,
        statusLabel: pane.statusLabel,
        attendeeName: printParagraphs[3] || printCells[0] || '',
        attendeeContact: printParagraphs[4] ? `${printParagraphs[4]} / ${printParagraphs[5] || ''}`.trim() : (printCells[1] || ''),
        signupTime: cleanText(signupTimeMatch?.[1] || ''),
        qrCodeUrl: normalizeUrl(qrMatch?.[1] || ''),
        detailUrl: ticketNo ? `${BASE_ORIGIN}/user/tikcets?tids=${ticketNo}` : '',
        pdfUrl: ticketNo ? `${BASE_ORIGIN}/user/ticket2pdf?id=${ticketNo}` : '',
        hasRefundToken: Boolean(refundTokenMatch?.[1]),
        eventUrl,
      });
    }
  }

  return {
    counts,
    totalReturned: tickets.length,
    tickets,
  };
}

/**
 * Parses `/user/tikcets?tids=<tid>` order & ticket detail page.
 */
export function parseTicketDetailHtml(html, fallbackTid = '') {
  const source = String(html ?? '');
  const orderMatch = source.match(/订单号[：:]\s*(\d+)/i);
  const orderTimeMatch = source.match(/下单时间[：:]\s*([0-9-]+\s+[0-9:]+)/i);
  const eventLinkMatch = source.match(/<a[^>]*href=["']([^"']*\/event\/(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);
  const tidMatch = source.match(/电子票号[\s\S]*?(\d{10,16})/i);
  const qrMatch = source.match(/src=["']([^"']*\/qrcode\/[^"']+)["']/i);
  const pdfMatch = source.match(/href=["']([^"']*\/user\/ticket2pdf\?id=[^"']+)["']/i);

  // Extract attendee info fields from main text or print span
  const nameMatch = source.match(/姓\s*名[：:]\s*([^\s<]+)/i);
  const phoneMatch = source.match(/手\s*机[：:]\s*([^\s<]+)/i);
  const emailMatch = source.match(/邮\s*箱[：:]\s*([^\s<]+)/i);

  const printSpanMatch = source.match(/<textarea[^>]*id=["']ticket_print_span_\d+["'][^>]*>([\s\S]*?)<\/textarea>/i);
  const printHtml = printSpanMatch ? decodeHtmlEntities(printSpanMatch[1]) : '';
  const printParagraphs = [...printHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => cleanText(m[1]));
  const titleThMatch = printHtml.match(/<th[^>]*>([\s\S]*?)(?:<span|$)/i);
  const signupTimeMatch = printHtml.match(/报名时间：([^<]+)/i);

  const ticketNo = tidMatch?.[1] || printParagraphs[0] || fallbackTid;
  const eventTitle = cleanText(eventLinkMatch?.[3] || titleThMatch?.[1] || '');

  return {
    ticketNo,
    orderNo: orderMatch?.[1] || '',
    orderTime: cleanText(orderTimeMatch?.[1] || signupTimeMatch?.[1] || ''),
    eventId: eventLinkMatch?.[2] || '',
    eventTitle,
    eventUrl: normalizeUrl(eventLinkMatch?.[1] || ''),
    timeRange: printParagraphs[1] || '',
    venue: printParagraphs[2] || '',
    ticketTitle: printParagraphs[7] || '免费票',
    price: printParagraphs[6] || '免费',
    attendeeName: cleanText(nameMatch?.[1] || printParagraphs[3] || ''),
    attendeePhone: cleanText(phoneMatch?.[1] || printParagraphs[4] || ''),
    attendeeEmail: cleanText(emailMatch?.[1] || printParagraphs[5] || ''),
    qrCodeUrl: normalizeUrl(qrMatch?.[1] || ''),
    pdfUrl: normalizeUrl(pdfMatch?.[1] || (ticketNo ? `/user/ticket2pdf?id=${ticketNo}` : '')),
  };
}

/**
 * Parses `/user/userfollows` saved/favorited events (`#user-favorite-event` or first `.tab-pane`).
 */
export function parseFavoritesHtml(html, limit = 50) {
  const source = String(html ?? '');
  const favPaneMatch = source.match(/<div[^>]*class=["'][^"']*tab-pane[^"']*active[^"']*["'][^>]*>([\s\S]*?)(?=<div[^>]*id=["']user-favorite-org["']|$)/i);
  const scope = favPaneMatch ? favPaneMatch[1] : source;

  const items = [];
  const blocks = scope.split(/<li[^>]*>\s*<a[^>]*href=["'][^"']*\/event\/\d+[^"']*["']/i).slice(1);
  const links = [...scope.matchAll(/<li[^>]*>\s*<a[^>]*href=["']([^"']*\/event\/(\d+)[^"']*)["']/gi)];

  for (let i = 0; i < blocks.length && items.length < limit; i++) {
    const block = blocks[i];
    const href = links[i]?.[1] || '';
    const id = links[i]?.[2] || '';
    if (!id) continue;

    const titleMatch = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const orgMatch = block.match(/所属主办方[：:]\s*([\s\S]*?)<\/div>/i);
    const timeMatch = block.match(/活动时间[：:]\s*([\s\S]*?)<\/div>/i);
    const rawTime = cleanText(timeMatch?.[1] || '');
    const statusBadge = rawTime.match(/(即将开始|已经结束|进行中)/)?.[1] || '';
    const time = cleanText(rawTime.replace(/(即将开始|已经结束|进行中)$/, ''));

    items.push({
      rank: items.length + 1,
      id,
      title: cleanText(titleMatch?.[1] || ''),
      organizer: cleanText(orgMatch?.[1] || ''),
      time,
      status: statusBadge || '未知',
      url: normalizeUrl(href),
    });
  }

  return items;
}

/**
 * Parses `/user/userfollows` followed organizers (`#user-favorite-org` and `#user-favorite-person`).
 */
export function parseFollowingHtml(html, options = {}) {
  const source = String(html ?? '');
  const kindFilter = cleanText(options.kind || 'all').toLowerCase();
  const results = [];

  if (kindFilter === 'all' || kindFilter === 'org' || kindFilter === 'organizer') {
    const orgPane = source.match(/<div[^>]*id=["']user-favorite-org["'][^>]*>([\s\S]*?)(?=<div[^>]*id=["']user-favorite-person["']|$)/i)?.[1] || '';
    const liMatches = [...orgPane.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
    for (const m of liMatches) {
      const inner = m[1];
      const linkMatch = inner.match(/<h3[^>]*>\s*<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i)
        || inner.match(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
      if (!linkMatch) continue;
      const name = cleanText(linkMatch[2]);
      if (!name) continue;
      const bioMatch = inner.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      results.push({
        rank: results.length + 1,
        kind: 'organizer',
        name,
        bio: cleanText(bioMatch?.[1] || ''),
        url: normalizeUrl(linkMatch[1]),
      });
    }
  }

  if (kindFilter === 'all' || kindFilter === 'person' || kindFilter === 'people') {
    const personPane = source.match(/<div[^>]*id=["']user-favorite-person["'][^>]*>([\s\S]*?)(?=<div[^>]*class=["']aside|$)/i)?.[1] || '';
    const liMatches = [...personPane.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
    for (const m of liMatches) {
      const inner = m[1];
      const h3Match = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
      const linkMatch = inner.match(/<a[^>]*href=["']([^"']*\/people\/[^"']+)["']/i);
      if (!h3Match && !linkMatch) continue;
      const rawTitle = cleanText(h3Match?.[1] || '');
      const divMatches = [...inner.matchAll(/<div[^>]*>([\s\S]*?)<\/div>/gi)].map((d) => cleanText(d[1])).filter(Boolean);
      results.push({
        rank: results.length + 1,
        kind: 'person',
        name: rawTitle.split(/\s+/)[0] || rawTitle,
        location: rawTitle.split(/\s+/).slice(1).join(' '),
        bio: divMatches[divMatches.length - 1] || '',
        url: normalizeUrl(linkMatch?.[1] || ''),
      });
    }
  }

  return results;
}

/**
 * Parses `/account/profile` HTML form `#edit_profile_form` and `mUserState`.
 */
export function parseProfileHtml(html) {
  const source = String(html ?? '');
  const formMatch = source.match(/<form[^>]*id=["']edit_profile_form["'][^>]*>([\s\S]*?)<\/form>/i);
  const formHtml = formMatch ? formMatch[1] : source;

  const fields = {};
  const inputRegex = /<input[^>]*>/gi;
  let m;
  while ((m = inputRegex.exec(formHtml)) !== null) {
    const tag = m[0];
    const name = tag.match(/\bname=["']([^"']+)["']/i)?.[1];
    if (!name) continue;
    const type = (tag.match(/\btype=["']([^"']+)["']/i)?.[1] || 'text').toLowerCase();
    const val = decodeHtmlEntities(tag.match(/\bvalue=["']([^"']*)["']/i)?.[1] ?? '');
    if (type === 'radio') {
      if (/\bchecked\b/i.test(tag)) {
        fields[name] = val;
      } else if (!(name in fields)) {
        fields[name] = '';
      }
    } else {
      fields[name] = val;
    }
  }

  const userState = parseUserStateHtml(source);
  return {
    account: fields.Account || userState.userId || '',
    nick: fields.Nick ?? userState.nick ?? '',
    realName: fields.RealName ?? userState.realName ?? '',
    brief: fields.Brief ?? userState.brief ?? '',
    phone: fields.Phone || userState.phone || '',
    email: fields.Email || userState.email || '',
    country: fields.Country || '',
    province: fields.Province || '',
    city: fields.City || '',
    birthday: fields.Birthday || '',
    gender: fields.Gender ?? '0',
    logo: fields.Logo || userState.avatar || '',
    logoLarge: fields.LogoLarge || '',
    emailActivated: fields.EmailActivated || '',
    phoneActivated: fields.PhoneActivated || '',
    rawFormFields: fields,
  };
}

/**
 * Parses `/zhubanfang` organizers directory HTML across all `.organizer-well-list` sections.
 */
export function parseOrganizersHtml(html, limit = 20) {
  const source = String(html ?? '');
  const listMatches = [...source.matchAll(/<ul[^>]*class=["'][^"']*organizer-well-list[^"']*["'][^>]*>([\s\S]*?)<\/ul>/gi)];
  const scope = listMatches.length > 0 ? listMatches.map((m) => m[1]).join('\n') : source;
  const liBlocks = [...scope.matchAll(/<li([^>]*)>([\s\S]*?)<\/li>/gi)];
  const rows = [];
  const seen = new Set();

  for (const m of liBlocks) {
    if (rows.length >= limit) break;
    const liAttrs = m[1] || '';
    const inner = m[2] || '';
    const h4Link = inner.match(/<h4[^>]*>\s*<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    const genericLink = inner.match(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    const linkMatch = h4Link || genericLink;
    if (!linkMatch) continue;

    const url = normalizeUrl(linkMatch[1]);
    const liTitle = liAttrs.match(/\btitle=["']([^"']+)["']/i)?.[1] || '';
    const name = cleanText(h4Link ? h4Link[2] : (liTitle || linkMatch[2]));
    if (!name || seen.has(name)) continue;

    const statsMatch = inner.match(/主办了\s*<em>(\d+)<\/em>\s*场活动[\s\S]*?<em>(\d+)<\/em>\s*人关注/i);
    const compactFollowersMatch = inner.match(/(\d+)\s*人关注/i);
    const eventsCount = Number(statsMatch?.[1] || 0);
    const followers = Number(statsMatch?.[2] || compactFollowersMatch?.[1] || 0);
    const bioMatch = inner.match(/<p(?![^>]*class=["']event["'])[^>]*>([\s\S]*?)<\/p>/i);
    const recentEventMatch = inner.match(/<p[^>]*class=["']event["'][^>]*>[\s\S]*?<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    const imgMatch = inner.match(/<img[^>]*src=["']([^"']+)["']/i);

    seen.add(name);
    rows.push({
      rank: rows.length + 1,
      name,
      eventsCount,
      followers,
      bio: cleanText(bioMatch?.[1] || ''),
      recentEventTitle: cleanText(recentEventMatch?.[2] || ''),
      recentEventUrl: normalizeUrl(recentEventMatch?.[1] || ''),
      logo: normalizeUrl(imgMatch?.[1] || ''),
      url,
    });
  }

  return rows;
}

/**
 * Parses `/ranklist` popularity ranklist HTML.
 */
export function parseRanklistHtml(html, limit = 20) {
  const source = String(html ?? '');
  const parts = source.split(/<div[^>]*class=["'][^"']*popularity-son-item\b[^"']*["'][^>]*>/i).slice(1);
  const rows = [];
  const seen = new Set();

  for (const part of parts) {
    if (rows.length >= limit) break;
    const linkMatch = part.match(/<a[^>]*class=["'][^"']*popularity-son-item-right[^"']*["'][^>]*href=["']([^"']*\/event\/(\d+)[^"']*)["']/i)
      || part.match(/href=["']([^"']*\/event\/(\d+)[^"']*)["']/i);
    const id = linkMatch?.[2] || '';
    if (!id || seen.has(id)) continue;

    const titleMatch = part.match(/<(?:p|div)[^>]*class=["'][^"']*item-title[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|div)>/i)
      || part.match(/<img[^>]*class=["'][^"']*item-logo[^"']*["'][^>]*\btitle=["']([^"']+)["']/i);
    const timeMatch = part.match(/<p[^>]*class=["'][^"']*item-data[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)
      || part.match(/<div[^>]*class=["'][^"']*item-data[^"']*["'][^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
    const locMatch = part.match(/<(?:p|div)[^>]*class=["'][^"']*item-dress-pp[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|div)>/i);
    const orgMatch = part.match(/<(?:p|div|span)[^>]*class=["'][^"']*user-name[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|div|span)>/i);
    const heatMatch = part.match(/<(?:p|div|span)[^>]*class=["'][^"']*item-look[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|div|span)>/i);

    seen.add(id);
    rows.push({
      rank: rows.length + 1,
      id,
      title: cleanText(titleMatch?.[1] || ''),
      time: cleanText(timeMatch?.[1] || ''),
      location: cleanText(locMatch?.[1] || ''),
      organizer: cleanText(orgMatch?.[1] || ''),
      heatScore: Number(cleanText(heatMatch?.[1] || '0')) || 0,
      url: normalizeUrl(linkMatch?.[1] || `/event/${id}`),
    });
  }

  return rows;
}

/**
 * Parses `/topic` curated special topics HTML.
 */
export function parseTopicsHtml(html, limit = 20) {
  const source = String(html ?? '');
  const listMatch = source.match(/<ul[^>]*class=["'][^"']*topic-list[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i);
  const scope = listMatch ? listMatch[1] : source;
  const liBlocks = [...scope.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
  const rows = [];

  for (const m of liBlocks) {
    if (rows.length >= limit) break;
    const inner = m[1];
    const linkMatch = inner.match(/<a[^>]*href=["']([^"']+)["']/i);
    const h3Match = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const dataAttrMatch = inner.match(/<div[^>]*\bdata=["']([^"']+)["']/i);
    let meta = {};
    if (dataAttrMatch?.[1]) {
      try {
        meta = JSON.parse(decodeHtmlEntities(dataAttrMatch[1]));
      } catch {
        meta = {};
      }
    }
    const title = cleanText(h3Match?.[1] || meta.ExTitle || '');
    if (!title) continue;

    rows.push({
      rank: rows.length + 1,
      id: String(meta.Id || linkMatch?.[1]?.match(/(\d+)/)?.[1] || rows.length + 1),
      title,
      summary: cleanText(meta.Summary || ''),
      views: Number(meta.ViewCount || 0),
      eventCount: Number(meta.EventNumber || 0),
      updatedAt: parseMsJsonDate(meta.UpdateDate || ''),
      url: normalizeUrl(linkMatch?.[1] || meta.RawUrl || ''),
    });
  }

  return rows;
}

/**
 * Parses `/console/home` Organizer Console dashboard state.
 */
export function parseConsoleHomeHtml(html) {
  const source = String(html ?? '');
  const currentUser = extractJsVarJson(source, ['currentUser', 'currenUser']) || {};
  const mUserState = extractJsVarJson(source, ['mUserState']) || {};
  const ext = currentUser.Extends || {};
  const account = cleanText(currentUser.Account || mUserState.UserId || '');

  return {
    account,
    nick: cleanText(currentUser.Nick || mUserState.Name || ''),
    realName: cleanText(currentUser.RealName || ''),
    brief: cleanText(currentUser.Brief || ''),
    company: cleanText(ext.Company || ''),
    jobTitle: cleanText(ext.JobTitle || ''),
    country: cleanText(ext.Country || ''),
    province: cleanText(ext.Province || ''),
    city: cleanText(ext.City || ''),
    isAuthenticated: Boolean((account && account !== '0') || Number(mUserState.AuthType ?? -1) > -1),
    isAgentSigned: Boolean(currentUser.IsAgent),
    isVip: Boolean(currentUser.IsVip),
    isOnlineVip: Boolean(currentUser.IsOnlineVip),
    balanceBean: Number(currentUser.BalanceBean ?? 0),
    orgCount: Number(currentUser.OrgCount ?? 0),
    loginTimes: Number(currentUser.LoginTimes ?? 0),
    lastLogin: cleanText(currentUser.LastLogin || mUserState.LastLoginDate || ''),
    createDate: cleanText(currentUser.CreateDate || ''),
  };
}

/**
 * Parses `/console/eventadmin` status tabs and `/console/userpubevents` AJAX rows.
 */
export function parseConsoleEventsHtml(html, ajaxHtml = '') {
  const source = String(html ?? '');
  const currenUser = extractJsVarJson(source, ['currenUser', 'currentUser']) || {};

  // Extract status tab definitions `{value: -3, label: '全部状态', total: "0"}`
  const statusTabs = [];
  const tabRegex = /\{\s*value\s*:\s*(-?\d+)\s*,\s*label\s*:\s*['"]([^'"]+)['"]\s*,\s*total\s*:\s*['"](\d+)['"]\s*\}/g;
  let tm;
  while ((tm = tabRegex.exec(source)) !== null) {
    statusTabs.push({
      statusCode: Number(tm[1]),
      label: cleanText(tm[2]),
      total: Number(tm[3]),
    });
  }

  const events = [];
  const combined = `${source}\n${ajaxHtml || ''}`;
  const eventLinks = [...combined.matchAll(/<a[^>]*href=["']([^"']*\/event\/(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const seen = new Set();
  for (const m of eventLinks) {
    const id = m[2];
    const title = cleanText(m[3]);
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    events.push({
      rank: events.length + 1,
      id,
      title,
      url: normalizeUrl(m[1]),
    });
  }

  return {
    account: cleanText(currenUser.Account || ''),
    nick: cleanText(currenUser.Nick || ''),
    statusTabs,
    totalEvents: statusTabs.find((t) => t.statusCode === -3)?.total ?? events.length,
    events,
  };
}
