// Excel / CSV guest import: read a spreadsheet into rows, guess a column mapping, build guests.

import { createGuest } from './model.js';

export const GUEST_FIELDS = [
  { key: 'name', label: 'Full name', hints: ['name', 'full name', 'guest', 'guest name'] },
  { key: 'firstName', label: 'First name', hints: ['first', 'first name', 'firstname', 'given name'] },
  { key: 'lastName', label: 'Last name', hints: ['last', 'last name', 'lastname', 'surname', 'family name'] },
  { key: 'group', label: 'Group / party', hints: ['group', 'party', 'side', 'household', 'family', 'category'] },
  { key: 'email', label: 'Email', hints: ['email', 'e-mail', 'mail'] },
  { key: 'phone', label: 'Phone', hints: ['phone', 'mobile', 'tel', 'telephone', 'cell'] },
  { key: 'rsvp', label: 'RSVP status', hints: ['rsvp', 'status', 'attending', 'response', 'coming'] },
  { key: 'table', label: 'Table', hints: ['table', 'table name', 'table number', 'table no'] },
  { key: 'meal', label: 'Meal / dietary', hints: ['meal', 'menu', 'diet', 'dietary', 'food', 'allergies'] },
  { key: 'notes', label: 'Notes', hints: ['notes', 'note', 'comments', 'comment'] },
];

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 5000;

/** Returns { headers: string[], rows: string[][] } from a .csv/.tsv/.txt/.xlsx/.xls/.ods file. */
export async function readSpreadsheet(file) {
  if (!file) throw new Error('No file selected.');
  if (file.size > MAX_BYTES) throw new Error('That spreadsheet is larger than 10 MB.');
  const ext = file.name.split('.').pop().toLowerCase();
  let matrix;

  if (['csv', 'tsv', 'txt'].includes(ext)) {
    const Papa = (await import('papaparse')).default;
    const text = await file.text();
    const result = Papa.parse(text, { skipEmptyLines: 'greedy' });
    matrix = result.data;
  } else if (['xlsx', 'xls', 'ods', 'xlsm'].includes(ext)) {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error('The workbook has no sheets.');
    matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '', raw: false });
  } else {
    throw new Error('Please choose a .csv, .xlsx, .xls or .ods file.');
  }

  const clean = matrix
    .map((row) => (Array.isArray(row) ? row.map((c) => String(c ?? '').trim()) : []))
    .filter((row) => row.some(Boolean));
  if (!clean.length) throw new Error('The file is empty.');

  const width = Math.max(...clean.map((r) => r.length));
  const pad = (r) => Array.from({ length: width }, (_, i) => r[i] ?? '');
  const first = pad(clean[0]);
  // If the first row looks like data rather than headings, synthesise headings.
  const looksLikeHeader = first.some((c) => GUEST_FIELDS.some((f) => f.hints.includes(c.toLowerCase())));
  const headers = looksLikeHeader ? first.map((h, i) => h || `Column ${i + 1}`) : first.map((_, i) => `Column ${i + 1}`);
  const rows = (looksLikeHeader ? clean.slice(1) : clean).slice(0, MAX_ROWS).map(pad);
  return { headers, rows };
}

export function guessMapping(headers) {
  const mapping = {};
  const used = new Set();
  GUEST_FIELDS.forEach((field) => {
    const idx = headers.findIndex((h, i) => !used.has(i) && field.hints.includes(h.toLowerCase().trim()));
    if (idx >= 0) {
      mapping[field.key] = idx;
      used.add(idx);
    }
  });
  if (mapping.name === undefined && mapping.firstName === undefined && headers.length) mapping.name = 0;
  return mapping;
}

function toRsvp(value) {
  const v = value.toLowerCase();
  if (/^(y|yes|confirmed?|accept(ed)?|attending|going|true|1)$/.test(v)) return 'confirmed';
  if (/^(n|no|declined?|regrets?|not attending|false|0)$/.test(v)) return 'declined';
  return 'pending';
}

/** Builds guests from rows. `tableIdFor(label)` resolves a table cell to a table id (or null). */
export function rowsToGuests(rows, mapping, tableIdFor = () => null) {
  const cell = (row, key) => (mapping[key] === undefined || mapping[key] === '' ? '' : row[mapping[key]] ?? '');
  return rows
    .map((row) => {
      const name = cell(row, 'name') || [cell(row, 'firstName'), cell(row, 'lastName')].filter(Boolean).join(' ');
      if (!name.trim()) return null;
      return {
        guest: createGuest(name, {
          group: cell(row, 'group').slice(0, 60),
          email: cell(row, 'email').slice(0, 120),
          phone: cell(row, 'phone').slice(0, 40),
          meal: cell(row, 'meal').slice(0, 60),
          notes: cell(row, 'notes').slice(0, 500),
          rsvp: toRsvp(cell(row, 'rsvp')),
        }),
        tableId: tableIdFor(cell(row, 'table')),
      };
    })
    .filter(Boolean);
}

/** Paste-a-list: one guest per line; also accepts "Name, Group" or tab-separated "Name<TAB>Group". */
export function parsePastedNames(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_ROWS)
    .map((line) => {
      const [name, group = ''] = line.split(/\t|\s*[,;]\s*/);
      return createGuest(name.replace(/^[-*•\d.)\s]+/, ''), { group: group.slice(0, 60) });
    });
}
