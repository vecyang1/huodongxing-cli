/**
 * Multi-format output renderers for Huodongxing CLI (json, table, md, csv).
 */

function formatCellValue(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (Array.isArray(val)) {
    return val
      .map((item) => (typeof item === 'object' && item !== null ? item.name || item.title || item.id || JSON.stringify(item) : String(item)))
      .join(', ');
  }
  if (typeof val === 'object') {
    return JSON.stringify(val);
  }
  return String(val);
}

function extractRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.events)) return payload.events;
    if (Array.isArray(payload.tickets) && !payload.event_id) return payload.tickets;
    return [payload];
  }
  return [{ value: payload }];
}

function inferColumns(rows, preferredColumns = null) {
  if (Array.isArray(preferredColumns) && preferredColumns.length > 0) {
    return preferredColumns;
  }
  if (!rows.length) return [];
  const keys = Object.keys(rows[0]).filter((k) => {
    const v = rows[0][k];
    return typeof v !== 'object' || v === null || Array.isArray(v);
  });
  return keys.slice(0, 8);
}

export function toCsv(payload, preferredColumns = null) {
  const rows = extractRows(payload);
  if (!rows.length) return '';
  const cols = inferColumns(rows, preferredColumns);
  const escapeCsv = (s) => {
    const str = formatCellValue(s).replace(/\r?\n/g, ' ');
    if (/[",]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const header = cols.map(escapeCsv).join(',');
  const body = rows.map((r) => cols.map((c) => escapeCsv(r[c])).join(',')).join('\n');
  return `${header}\n${body}`;
}

export function toMarkdownTable(payload, preferredColumns = null) {
  const rows = extractRows(payload);
  if (!rows.length) return '_No records found._';
  const cols = inferColumns(rows, preferredColumns);
  const escapeMd = (s) => formatCellValue(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').slice(0, 80);
  const header = `| ${cols.join(' | ')} |`;
  const sep = `| ${cols.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${cols.map((c) => escapeMd(r[c])).join(' | ')} |`).join('\n');
  return `${header}\n${sep}\n${body}`;
}

export function toTerminalTable(payload, preferredColumns = null) {
  const rows = extractRows(payload);
  if (!rows.length) return '(0 items)';
  const cols = inferColumns(rows, preferredColumns);
  const maxColWidth = 38;

  const matrix = rows.map((r) =>
    cols.map((c) => {
      const str = formatCellValue(r[c]).replace(/\r?\n/g, ' ');
      return str.length > maxColWidth ? `${str.slice(0, maxColWidth - 1)}…` : str;
    })
  );

  const widths = cols.map((c, idx) => {
    const cellMax = matrix.reduce((acc, row) => Math.max(acc, row[idx].length), 0);
    return Math.max(c.length, cellMax);
  });

  const pad = (str, len) => str + ' '.repeat(Math.max(0, len - str.length));
  const header = cols.map((c, i) => pad(c, widths[i])).join('  ');
  const divider = widths.map((w) => '-'.repeat(w)).join('  ');
  const lines = matrix.map((row) => row.map((cell, i) => pad(cell, widths[i])).join('  '));
  return [header, divider, ...lines].join('\n');
}

export function formatOutput(payload, format = 'json', preferredColumns = null) {
  const fmt = String(format || 'json').toLowerCase();
  if (fmt === 'csv') return toCsv(payload, preferredColumns);
  if (fmt === 'md' || fmt === 'markdown') return toMarkdownTable(payload, preferredColumns);
  if (fmt === 'table') return toTerminalTable(payload, preferredColumns);
  return JSON.stringify(payload, null, 2);
}
