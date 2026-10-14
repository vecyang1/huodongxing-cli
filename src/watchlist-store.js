import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanText, normalizeCityName } from './parsers.js';
import { generateEventsIcs } from './ics.js';

export function getWatchlistFile() {
  return (
    process.env.HDX_WATCHLIST_PATH ||
    path.join(os.homedir(), '.config', 'huodongxing-cli', 'watchlist.json')
  );
}

function redactHome(filePath) {
  const home = os.homedir();
  if (home && String(filePath).startsWith(home)) {
    return `~${String(filePath).slice(home.length)}`;
  }
  return String(filePath);
}

function createValidationError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = statusCode === 404 ? 'NOT_FOUND' : 'VALIDATION_ERROR';
  return err;
}

export function extractCanonicalEventId(input) {
  const raw = cleanText(input);
  if (!raw) return '';
  const urlMatch = raw.match(/\/event\/(\d{6,20})/);
  if (urlMatch) return urlMatch[1];
  if (/^\d{6,20}$/.test(raw)) return raw;
  return '';
}

function readRawStore() {
  const file = getWatchlistFile();
  try {
    if (!fs.existsSync(file)) {
      return { version: 1, updatedAt: null, items: [] };
    }
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || !Array.isArray(parsed.items)) {
      return { version: 1, updatedAt: null, items: [] };
    }
    return parsed;
  } catch {
    return { version: 1, updatedAt: null, items: [] };
  }
}

function writeRawStore(items) {
  const file = getWatchlistFile();
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items,
  };
  const tmpFile = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  fs.renameSync(tmpFile, file);
  // SSOT Unidirectional Data Flow: Always re-read from disk after write
  return readRawStore();
}

/**
 * Reads and filters the authoritative watchlist from disk.
 */
export function listWatchlist(filters = {}) {
  const store = readRawStore();
  const statusFilter = cleanText(filters.status || 'active').toLowerCase();
  const cityFilter = cleanText(filters.city || '');
  const normalizedCity = cityFilter && cityFilter !== '全部' ? normalizeCityName(cityFilter) : '';
  const query = cleanText(filters.q || filters.keyword || '').toLowerCase();

  const allItems = store.items || [];
  const counts = {
    total: allItems.length,
    active: allItems.filter((i) => i.status !== 'archived').length,
    saved: allItems.filter((i) => i.status === 'saved').length,
    attending: allItems.filter((i) => i.status === 'attending').length,
    archived: allItems.filter((i) => i.status === 'archived').length,
  };

  const filtered = allItems.filter((item) => {
    if (statusFilter === 'active' && item.status === 'archived') return false;
    if (statusFilter === 'saved' && item.status !== 'saved') return false;
    if (statusFilter === 'attending' && item.status !== 'attending') return false;
    if (statusFilter === 'archived' && item.status !== 'archived') return false;

    if (normalizedCity) {
      const itemCity = `${item.matchedCity || ''} ${item.city || ''} ${item.location || ''}`;
      if (!itemCity.includes(normalizedCity)) return false;
    }

    if (query) {
      const hay = `${item.id} ${item.title} ${item.organizer || ''} ${item.location || ''} ${item.note || ''} ${(item.matchedTags || []).join(' ')}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });

  const priorityOrder = { high: 3, medium: 2, low: 1 };
  filtered.sort((a, b) => {
    const pa = priorityOrder[a.priority] || 2;
    const pb = priorityOrder[b.priority] || 2;
    if (pb !== pa) return pb - pa;
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  });

  return {
    storePath: redactHome(getWatchlistFile()),
    updatedAt: store.updatedAt,
    counts,
    count: filtered.length,
    items: filtered,
  };
}

/**
 * Creates or updates a watchlist item by its immutable Huodongxing event ID.
 */
export function upsertWatchlistItem(payload = {}) {
  const canonicalId = extractCanonicalEventId(payload.id || payload.eventId || payload.url);
  if (!canonicalId) {
    throw createValidationError('请提供有效的活动行活动 ID（6-20位数字）或活动链接 (/event/<id>)', 400);
  }

  const title = cleanText(payload.title || payload.eventTitle || '');
  if (!title) {
    throw createValidationError('活动标题 (title) 不能为空', 400);
  }

  const priority = cleanText(payload.priority || 'high').toLowerCase();
  if (!['high', 'medium', 'low'].includes(priority)) {
    throw createValidationError('优先级 (priority) 必须为 high, medium 或 low', 400);
  }

  const status = cleanText(payload.status || 'saved').toLowerCase();
  if (!['saved', 'attending', 'archived'].includes(status)) {
    throw createValidationError('状态 (status) 必须为 saved, attending 或 archived', 400);
  }

  const store = readRawStore();
  const now = new Date().toISOString();
  const existingIdx = store.items.findIndex((i) => String(i.id) === canonicalId);
  const rawCity = cleanText(payload.matchedCity || payload.city || '深圳');
  const normalizedCity = normalizeCityName(rawCity);

  const record = {
    id: canonicalId,
    title,
    time: cleanText(payload.time || payload.eventTime || '待定时间'),
    matchedCity: normalizedCity === '全部' ? rawCity : normalizedCity,
    city: cleanText(payload.city || normalizedCity),
    location: cleanText(payload.location || payload.address || normalizedCity),
    organizer: cleanText(payload.organizer || '活动行主办方'),
    eventType: cleanText(payload.eventType || 'offline'),
    url: cleanText(payload.url || `https://www.huodongxing.com/event/${canonicalId}`),
    recommendScore: Number(payload.recommendScore || 0),
    matchedTags: Array.isArray(payload.matchedTags)
      ? payload.matchedTags.map((t) => cleanText(t)).filter(Boolean)
      : cleanText(payload.matchedTags || '')
          .split(/[,，、;/|\s]+/)
          .filter(Boolean),
    priority,
    status,
    note: cleanText(payload.note ?? (existingIdx >= 0 ? store.items[existingIdx].note : '')),
    createdAt: existingIdx >= 0 ? store.items[existingIdx].createdAt : now,
    updatedAt: now,
  };

  const nextItems = [...store.items];
  if (existingIdx >= 0) {
    nextItems[existingIdx] = record;
  } else {
    nextItems.unshift(record);
  }

  writeRawStore(nextItems);
  return {
    action: existingIdx >= 0 ? 'updated' : 'created',
    item: record,
    watchlist: listWatchlist({ status: 'all' }),
  };
}

/**
 * Updates mutable operator fields (`status`, `priority`, `note`, `title`, `time`, `city`) on an existing watchlist item.
 */
export function updateWatchlistItem(id, patch = {}) {
  const canonicalId = extractCanonicalEventId(id) || cleanText(id);
  if (!canonicalId) {
    throw createValidationError('无效的活动 ID', 400);
  }

  const store = readRawStore();
  const idx = store.items.findIndex((i) => String(i.id) === canonicalId);
  if (idx === -1) {
    throw createValidationError(`未在关注清单中找到活动 ID: ${canonicalId}`, 404);
  }

  const current = store.items[idx];
  const next = { ...current, updatedAt: new Date().toISOString() };

  if (patch.status !== undefined) {
    const st = cleanText(patch.status).toLowerCase();
    if (!['saved', 'attending', 'archived'].includes(st)) {
      throw createValidationError('状态 (status) 必须为 saved, attending 或 archived', 400);
    }
    next.status = st;
  }

  if (patch.priority !== undefined) {
    const pr = cleanText(patch.priority).toLowerCase();
    if (!['high', 'medium', 'low'].includes(pr)) {
      throw createValidationError('优先级 (priority) 必须为 high, medium 或 low', 400);
    }
    next.priority = pr;
  }

  if (patch.note !== undefined) {
    next.note = cleanText(patch.note);
  }

  if (patch.title !== undefined) {
    const t = cleanText(patch.title);
    if (!t) throw createValidationError('活动标题不能为空', 400);
    next.title = t;
  }

  if (patch.time !== undefined) {
    next.time = cleanText(patch.time);
  }

  if (patch.city !== undefined) {
    const c = normalizeCityName(patch.city);
    next.city = c;
    next.matchedCity = c;
  }

  const nextItems = [...store.items];
  nextItems[idx] = next;
  writeRawStore(nextItems);

  return {
    action: 'updated',
    item: next,
    watchlist: listWatchlist({ status: 'all' }),
  };
}

/**
 * Permanently deletes an item from the watchlist store.
 */
export function deleteWatchlistItem(id) {
  const canonicalId = extractCanonicalEventId(id) || cleanText(id);
  if (!canonicalId) {
    throw createValidationError('无效的活动 ID', 400);
  }

  const store = readRawStore();
  const idx = store.items.findIndex((i) => String(i.id) === canonicalId);
  if (idx === -1) {
    throw createValidationError(`未在关注清单中找到活动 ID: ${canonicalId}`, 404);
  }

  const removed = store.items[idx];
  const nextItems = store.items.filter((i) => String(i.id) !== canonicalId);
  writeRawStore(nextItems);

  return {
    action: 'deleted',
    removed,
    watchlist: listWatchlist({ status: 'all' }),
  };
}

/**
 * Exports active watchlist items to RFC 5545 iCalendar (.ics) format.
 */
export function exportWatchlistIcs(filters = {}) {
  const res = listWatchlist({ status: filters.status || 'active', city: filters.city, q: filters.q });
  const ics = generateEventsIcs(res.items, {
    calendarName: '活动行关注与行程清单 (广佛深)',
  });
  return {
    count: res.items.length,
    ics,
  };
}
