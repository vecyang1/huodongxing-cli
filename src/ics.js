/**
 * RFC 5545 iCalendar (.ics) Exporter for Huodongxing Tickets & Events
 */

function escapeIcsText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
    .trim();
}

function formatUtcIcsTimestamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`
    + `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * Parses Huodongxing ticket time strings such as:
 * - "2026-10-27 09:00"
 * - "10/27 09:00 至 10/29 15:00" (with fallback year from eventTime or current year)
 */
export function parseTicketDateRange(eventTime, timeRange, fallbackYear = new Date().getFullYear()) {
  const normalizeCnDate = (str) =>
    String(str || '')
      .replace(/(\d{4})年(\d{1,2})月(\d{1,2})日?/g, '$1-$2-$3')
      .replace(/(\d{1,2})月(\d{1,2})日?/g, '$1/$2');

  const normEventTime = normalizeCnDate(eventTime);
  const normTimeRange = normalizeCnDate(timeRange);
  const combined = `${normEventTime} ${normTimeRange}`.trim();

  // ISO format (e.g. from parseEventDetailHtml startTime/endTime)
  const isoMatch = normEventTime.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  if (isoMatch) {
    const startUtc = new Date(normEventTime);
    const endUtc = normTimeRange && !Number.isNaN(new Date(normTimeRange).getTime())
      ? new Date(normTimeRange)
      : new Date(startUtc.getTime() + 2 * 3600 * 1000);
    if (!Number.isNaN(startUtc.getTime())) {
      return { start: startUtc, end: endUtc };
    }
  }

  const yearMatch = normEventTime.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:\s+(?:周[一二三四五六日天]\s*)?(\d{1,2}):(\d{2}))?/);
  const baseYear = yearMatch ? Number(yearMatch[1]) : fallbackYear;

  const spanMatch = combined.match(
    /(?:(\d{4})[/-])?(\d{1,2})[/-](\d{1,2})\s+(?:周[一二三四五六日天]\s*)?(\d{1,2}):(\d{2})\s*(?:至|~|-)\s*(?:(\d{4})[/-])?(\d{1,2})[/-](\d{1,2})\s+(?:周[一二三四五六日天]\s*)?(\d{1,2}):(\d{2})/,
  );
  if (spanMatch) {
    const [, syRaw, smRaw, sdRaw, shRaw, sminRaw, eyRaw, emRaw, edRaw, ehRaw, eminRaw] = spanMatch;
    const startYear = syRaw ? Number(syRaw) : baseYear;
    const sm = Number(smRaw);
    const sd = Number(sdRaw);
    const sh = Number(shRaw);
    const smin = Number(sminRaw);
    const em = Number(emRaw);
    const ed = Number(edRaw);
    const eh = Number(ehRaw);
    const emin = Number(eminRaw);
    const endYear = eyRaw ? Number(eyRaw) : (em < sm ? startYear + 1 : startYear);
    const startUtc = new Date(Date.UTC(startYear, sm - 1, sd, sh - 8, smin, 0));
    const endUtc = new Date(Date.UTC(endYear, em - 1, ed, eh - 8, emin, 0));
    return { start: startUtc, end: endUtc };
  }

  if (yearMatch) {
    const [, y, m, d, h = '9', min = '0'] = yearMatch;
    const startUtc = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(h) - 8, Number(min), 0));
    const endUtc = new Date(startUtc.getTime() + 2 * 3600 * 1000);
    return { start: startUtc, end: endUtc };
  }

  // Match "10/30 周五 13:30" or "10/31 周六 ~ 11/01 周日"
  const mdTimeMatch = combined.match(/(\d{1,2})[/-](\d{1,2})(?:\s*周[一二三四五六日天])?(?:\s+(\d{1,2}):(\d{2}))?/);
  if (mdTimeMatch) {
    const sm = Number(mdTimeMatch[1]);
    const sd = Number(mdTimeMatch[2]);
    const sh = mdTimeMatch[3] !== undefined ? Number(mdTimeMatch[3]) : 9;
    const smin = mdTimeMatch[4] !== undefined ? Number(mdTimeMatch[4]) : 0;
    const startUtc = new Date(Date.UTC(baseYear, sm - 1, sd, sh - 8, smin, 0));

    const multiDayMatch = combined.match(/(?:至|~|-)\s*(?:(\d{4})[/-])?(\d{1,2})[/-](\d{1,2})/);
    if (multiDayMatch) {
      const eyRaw = multiDayMatch[1];
      const em = Number(multiDayMatch[2]);
      const ed = Number(multiDayMatch[3]);
      const endYear = eyRaw ? Number(eyRaw) : (em < sm ? baseYear + 1 : baseYear);
      const endUtc = new Date(Date.UTC(endYear, em - 1, ed, 18 - 8, 0, 0));
      return { start: startUtc, end: endUtc };
    }
    return { start: startUtc, end: new Date(startUtc.getTime() + 2 * 3600 * 1000) };
  }

  const now = new Date();
  return { start: now, end: new Date(now.getTime() + 2 * 3600 * 1000) };
}

/**
 * Generates an RFC 5545 VCALENDAR string from an array of parsed Huodongxing tickets.
 * @param {Array<Object>} tickets
 * @param {Object} [options={}]
 * @returns {string}
 */
export function generateTicketsIcs(tickets = [], options = {}) {
  const calName = options.calendarName || 'Huodongxing (活动行) Tickets';
  const nowStamp = formatUtcIcsTimestamp(options.now instanceof Date ? options.now : new Date());

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Huodongxing CLI//NONSGML v1.0//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calName)}`,
    'X-WR-TIMEZONE:Asia/Shanghai',
  ];

  for (const ticket of tickets) {
    const uid = `urn:hdx:ticket:${ticket.ticketNo || ticket.eventId || ticket.id || Math.random().toString(36).slice(2)}`;
    const { start, end } = parseTicketDateRange(ticket.eventTime || ticket.startTime || ticket.time, ticket.timeRange || ticket.endTime);
    const summary = ticket.eventTitle || ticket.title || '活动行票券';
    const location = ticket.venue || ticket.address || ticket.location || ticket.city || '';
    const eventUrl = ticket.eventUrl || ticket.url || '';
    const descParts = [
      ticket.ticketNo ? `电子票号: ${ticket.ticketNo}` : '',
      ticket.id || ticket.eventId ? `活动ID: ${ticket.eventId || ticket.id}` : '',
      ticket.ticketTitle ? `票种: ${ticket.ticketTitle} (${ticket.price || '免费'})` : '',
      ticket.organizer ? `主办方: ${ticket.organizer}` : '',
      ticket.note ? `备注: ${ticket.note}` : '',
      `状态: ${ticket.statusLabel || ticket.statusKey || ticket.status || '有效'}`,
      eventUrl ? `活动链接: ${eventUrl}` : '',
      ticket.detailUrl ? `票券详情: ${ticket.detailUrl}` : '',
    ].filter(Boolean);

    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeIcsText(uid)}`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART:${formatUtcIcsTimestamp(start)}`,
      `DTEND:${formatUtcIcsTimestamp(end)}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `LOCATION:${escapeIcsText(location)}`,
      `DESCRIPTION:${escapeIcsText(descParts.join('\n'))}`,
      eventUrl ? `URL:${escapeIcsText(eventUrl)}` : '',
      'STATUS:CONFIRMED',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).join('\r\n') + '\r\n';
}

/**
 * Generates an RFC 5545 VCALENDAR string from an array of recommended or watchlisted events.
 */
export function generateEventsIcs(events = [], options = {}) {
  return generateTicketsIcs(events, {
    calendarName: options.calendarName || 'Huodongxing Regional Events & Watchlist',
    ...options,
  });
}
