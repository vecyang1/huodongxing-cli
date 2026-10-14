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
  const yearMatch = String(eventTime || '').match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{2})/);
  const baseYear = yearMatch ? Number(yearMatch[1]) : fallbackYear;

  const spanMatch = String(timeRange || '').match(
    /(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})\s*至\s*(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/,
  );
  if (spanMatch) {
    const [, sm, sd, sh, smin, em, ed, eh, emin] = spanMatch.map(Number);
    const endYear = em < sm ? baseYear + 1 : baseYear;
    // Huodongxing times are Asia/Shanghai (UTC+8)
    const startUtc = new Date(Date.UTC(baseYear, sm - 1, sd, sh - 8, smin, 0));
    const endUtc = new Date(Date.UTC(endYear, em - 1, ed, eh - 8, emin, 0));
    return { start: startUtc, end: endUtc };
  }

  if (yearMatch) {
    const [, y, m, d, h, min] = yearMatch.map(Number);
    const startUtc = new Date(Date.UTC(y, m - 1, d, h - 8, min, 0));
    const endUtc = new Date(startUtc.getTime() + 2 * 3600 * 1000);
    return { start: startUtc, end: endUtc };
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
    const uid = `urn:hdx:ticket:${ticket.ticketNo || ticket.eventId || Math.random().toString(36).slice(2)}`;
    const { start, end } = parseTicketDateRange(ticket.eventTime, ticket.timeRange);
    const summary = ticket.eventTitle || '活动行票券';
    const location = ticket.venue || '';
    const descParts = [
      `电子票号: ${ticket.ticketNo || 'N/A'}`,
      `票种: ${ticket.ticketTitle || '免费票'} (${ticket.price || '免费'})`,
      `状态: ${ticket.statusLabel || ticket.statusKey || '有效票'}`,
      ticket.eventUrl ? `活动链接: ${ticket.eventUrl}` : '',
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
      ticket.eventUrl ? `URL:${escapeIcsText(ticket.eventUrl)}` : '',
      'STATUS:CONFIRMED',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).join('\r\n') + '\r\n';
}
