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

function dateOrdinal(year, month, day) {
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

/**
 * Builds the canonical Huodongxing `/events` search URL.
 * Fixes the upstream OpenCLI bug where `d=ts` was passed unconditionally on empty dates,
 * causing Huodongxing's backend to return HTTP 500.
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
  params.set('city', cleanText(args.city) || '全部');

  const eventType = cleanText(args.eventType);
  if (eventType) {
    if (eventType !== '1' && eventType !== '2') {
      throw new Error('huodongxing eventType must be 1 (offline) or 2 (online)');
    }
    params.set('eventType', eventType);
  }
  const keyword = cleanText(args.qs ?? args.keyword ?? '');
  if (keyword) params.set('qs', keyword);
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

function parseEventTimeRange(timeText, options = {}) {
  const text = cleanText(timeText);
  if (!text) return null;
  const filterStart = parseYmd(options.date);
  const referenceDate = options.referenceDate instanceof Date ? options.referenceDate : new Date();
  const referenceOrdinal = dateOrdinal(
    referenceDate.getFullYear(),
    referenceDate.getMonth() + 1,
    referenceDate.getDate(),
  );
  if (/今天/.test(text)) return { start: referenceOrdinal, end: referenceOrdinal };
  if (/明天/.test(text)) return { start: referenceOrdinal + 1, end: referenceOrdinal + 1 };
  if (/后天/.test(text)) return { start: referenceOrdinal + 2, end: referenceOrdinal + 2 };

  const baseYear = options.year ?? (
    cleanText(options.date).match(/^(\d{4})-/)?.[1]
      ? Number(cleanText(options.date).slice(0, 4))
      : referenceDate.getFullYear()
  );
  const tokens = Array.from(text.matchAll(/(\d{1,2}[/-]\d{1,2})/g)).map((m) => m[1]);
  if (tokens.length === 0) return null;
  const start = parseMonthDayToken(tokens[0], baseYear);
  if (!start) return null;
  if (tokens.length === 1) return { start: start.ordinal, end: start.ordinal };
  const endYear = parseMonthDayToken(tokens[1], baseYear)?.month < start.month ? baseYear + 1 : baseYear;
  const end = parseMonthDayToken(tokens[1], endYear);
  if (!end) return { start: start.ordinal, end: start.ordinal };

  if (filterStart != null && end.ordinal < filterStart && start.month >= 10) {
    const nextStart = parseMonthDayToken(tokens[0], baseYear + 1);
    const nextEndYear = parseMonthDayToken(tokens[1], baseYear + 1)?.month < nextStart.month
      ? baseYear + 2
      : baseYear + 1;
    const nextEnd = parseMonthDayToken(tokens[1], nextEndYear);
    if (nextStart && nextEnd) return { start: nextStart.ordinal, end: nextEnd.ordinal };
  }
  return { start: start.ordinal, end: end.ordinal };
}

export function filterRowsByDateRange(rows, options = {}) {
  const filterStart = parseYmd(options.date);
  const filterEnd = parseYmd(options.dateTo) ?? filterStart;
  if (filterStart == null && filterEnd == null) return rows;
  const start = filterStart ?? filterEnd;
  const end = filterEnd ?? filterStart;
  const filtered = rows.filter((row) => {
    const range = parseEventTimeRange(row.time, options);
    if (!range) return true;
    return range.start <= end && range.end >= start;
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
 */
export function parseEventsHtml(html, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit || 20), 1), 100);
  const source = String(html ?? '');
  const parts = source.split(/<div[^>]*class=["'][^"']*search-tab-content-item-mesh[^"']*["'][^>]*>/i).slice(1);

  const rows = [];
  const seen = new Set();

  for (const rawBlock of parts) {
    if (rows.length >= limit) break;
    const block = rawBlock.split(/<\/div>\s*<\/div>\s*<\/div>/i)[0] || rawBlock.slice(0, 4000);
    const idMatch = block.match(/href=["'][^"']*\/event\/(\d+)[^"']*["']/i);
    const id = idMatch ? idMatch[1] : '';
    if (!id || seen.has(id)) continue;

    const titleLinkMatch = block.match(/<a[^>]*class=["'][^"']*item-title[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    const imgAltMatch = block.match(/<img[^>]*class=["'][^"']*item-logo[^"']*["'][^>]*alt=["']([^"']+)["']/i);
    const title = cleanText(titleLinkMatch?.[1]) || cleanText(imgAltMatch?.[1]) || '';
    if (!title) continue;

    const timeMatch = block.match(/<div[^>]*class=["'][^"']*item-dress[^"']*["'][^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
    const time = cleanText(timeMatch?.[1] || '');

    const locMatch = block.match(/class=["'][^"']*item-dress-pp[^"']*["'][^>]*>([\s\S]*?)<\//i);
    const location = cleanText(locMatch?.[1] || '');

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

  return filterRowsByDateRange(rows, options);
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

  // Parse tab header counts
  const counts = {
    valid: Number(source.match(/href=["']#user-ticket-success["'][^>]*>[\s\S]*?<span[^>]*>(\d+)<\/span>/i)?.[1] || 0),
    undone: Number(source.match(/href=["']#user-ticket-undone["'][^>]*>[\s\S]*?<span[^>]*>(\d+)<\/span>/i)?.[1] || 0),
    cancelled: Number(source.match(/href=["']#user-ticket-abort["'][^>]*>[\s\S]*?<span[^>]*>(\d+)<\/span>/i)?.[1] || 0),
    refund: Number(source.match(/href=["']#user-ticket-refund["'][^>]*>[\s\S]*?<span[^>]*>(\d+)<\/span>/i)?.[1] || 0),
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

    const itemBlocks = paneHtml.split(/<li[^>]*>\s*<div[^>]*class=["'][^"']*media[^"']*["'][^>]*>/i).slice(1);
    for (const block of itemBlocks) {
      const eventLinkMatch = block.match(/<h3[^>]*>\s*<a[^>]*href=["']([^"']*\/event\/(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);
      const eventUrl = normalizeUrl(eventLinkMatch?.[1] || '');
      const eventId = eventLinkMatch?.[2] || '';
      const eventTitle = cleanText(eventLinkMatch?.[3] || '');

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

      // Extract table cells inside printHtml or main table
      const printCells = [...printHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cleanText(m[1]));
      const mainRowCells = [...block.matchAll(/<tbody[^>]*>[\s\S]*?<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
      const firstRowTds = mainRowCells[0]
        ? [...mainRowCells[0][1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cleanText(m[1]))
        : [];

      const refundTokenMatch = block.match(/refundMyTicket\(\s*['"]([^'"]+)['"]/i);

      tickets.push({
        rank: tickets.length + 1,
        ticketNo,
        eventId,
        eventTitle,
        eventTime,
        timeRange: cleanText(timeRangeMatch?.[1] || eventTime),
        timeBadge,
        venue: cleanText(venueMatch?.[1] || ''),
        ticketTitle: printCells[2] || firstRowTds[0] || '免费票',
        quantity: Number(firstRowTds[1] || 1),
        price: printCells[3] || firstRowTds[2] || '免费',
        statusKey: pane.statusKey,
        statusLabel: pane.statusLabel,
        attendeeName: printCells[0] || '',
        attendeeContact: printCells[1] || '',
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

  // Extract attendee info fields
  const nameMatch = source.match(/姓\s*名[：:]\s*([^\s<]+)/i);
  const phoneMatch = source.match(/手\s*机[：:]\s*([^\s<]+)/i);
  const emailMatch = source.match(/邮\s*箱[：:]\s*([^\s<]+)/i);

  const ticketNo = tidMatch?.[1] || fallbackTid;
  return {
    ticketNo,
    orderNo: orderMatch?.[1] || '',
    orderTime: cleanText(orderTimeMatch?.[1] || ''),
    eventId: eventLinkMatch?.[2] || '',
    eventTitle: cleanText(eventLinkMatch?.[3] || ''),
    eventUrl: normalizeUrl(eventLinkMatch?.[1] || ''),
    attendeeName: cleanText(nameMatch?.[1] || ''),
    attendeePhone: cleanText(phoneMatch?.[1] || ''),
    attendeeEmail: cleanText(emailMatch?.[1] || ''),
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
