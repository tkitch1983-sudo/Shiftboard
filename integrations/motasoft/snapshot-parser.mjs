// Pure data normalisation for a future authorised, read-only VGM diary collector.
// This does NOT log in, fetch, book, alter, or remove anything in Motasoft.
// A snapshot is complete for one site + tab + date. Rows are not deduplicated by time:
// multiple bays/slots can share the same time, and appointment IDs are not yet known.
const TABS = new Set(['MOT Tests', 'Service & Repairs']);
const ALLOWED_COLUMNS = new Set(['time', 'notes', 'status', 'modified', 'user', 'bay', 'type', 'mot', 'customer']);

const requiredString = (v, label) => {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`Missing ${label}`);
  return v.trim();
};
const tidy = v => (v == null ? '' : String(v)).trim().slice(0, 500);

export function normalizeDiarySnapshot(input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid snapshot');
  const siteKey = requiredString(input.siteKey, 'siteKey');
  const tab = requiredString(input.tab, 'tab');
  if (!TABS.has(tab)) throw new Error('Unrecognised diary tab');
  const date = requiredString(input.date, 'date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + 'T12:00:00Z')) || new Date(date + 'T12:00:00Z').toISOString().slice(0,10) !== date) {
    throw new Error('Invalid date');
  }
  const capturedAt = requiredString(input.capturedAt, 'capturedAt');
  if (Number.isNaN(Date.parse(capturedAt))) throw new Error('Invalid capturedAt');
  if (!Array.isArray(input.headings) || !Array.isArray(input.rows)) throw new Error('Missing headings or rows');
  const headings = input.headings.map(h => tidy(h).toLowerCase());
  if (!headings.includes('time') || !headings.includes('type') || !headings.includes('customer')) {
    throw new Error('Expected VGM diary headings absent; stop instead of saving a partial/incorrect diary');
  }
  if (new Set(headings).size !== headings.length || headings.some(h => !ALLOWED_COLUMNS.has(h))) {
    throw new Error('Unexpected VGM diary headings; selector review required');
  }
  if (!input.rows.length) throw new Error('No visible diary slots; collection may have failed');

  const rows = input.rows.map((raw, index) => {
    if (!Array.isArray(raw) || raw.length !== headings.length) {
      throw new Error(`Unexpected column count at row ${index}`);
    }
    const row = { rowIndex: index };
    headings.forEach((heading, i) => { row[heading] = tidy(raw[i]); });
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.time)) {
      throw new Error(`Invalid diary time at row ${index}`);
    }
    return row;
  });
  return { siteKey, tab, date, capturedAt, slotCount: rows.length, rows };
}
