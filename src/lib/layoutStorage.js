// Save / open / export / share for layouts (Task 1).
// Every function here works on plain layout data or a DOM node and has no knowledge of React,
// so a cloud-save backend can be added alongside these without touching the rest of the app.

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { APP_NAME, normalizeData, tableName, RSVP_STATUSES } from './model.js';

export const APP_ID = 'seatcraft';
export const FORMAT_VERSION = 1;
export const SHARE_LINK_WARN_LENGTH = 8000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_CANVAS_PIXELS = 16_000_000; // keep well below browser canvas limits (Safari ~16.7M)

export class LayoutError extends Error {
  constructor(message, code = 'error') {
    super(message);
    this.name = 'LayoutError';
    this.code = code;
  }
}

/* ------------------------------------------------------------------ format + migration */

export function buildEnvelope(data) {
  return { version: FORMAT_VERSION, app: APP_ID, savedAt: new Date().toISOString(), data };
}

/**
 * Upgrades older file formats one step at a time. Add an entry here whenever FORMAT_VERSION changes:
 * MIGRATIONS[n] converts a version-n envelope into version n+1.
 */
const MIGRATIONS = {
  // v0 (early beta): flat `eventName`, tables used `type`, guests used `status` and `table` (index).
  0: (env) => {
    const d = env.data ?? {};
    const tables = (d.tables ?? []).map((t, i) => ({
      ...t,
      id: t.id ?? `t_legacy_${i}`,
      shape: t.shape ?? (t.type === 'rectangle' ? 'rect' : t.type),
      label: t.label ?? t.name ?? '',
    }));
    const guests = (d.guests ?? []).map((g) => {
      const table = Number.isInteger(g.table) ? tables[g.table] : null;
      return {
        ...g,
        rsvp: g.rsvp ?? ({ yes: 'confirmed', no: 'declined' }[g.status] || 'pending'),
        tableId: g.tableId ?? table?.id ?? null,
      };
    });
    return {
      ...env,
      version: 1,
      data: {
        event: d.event ?? { name: d.eventName ?? 'Untitled event', date: d.date ?? '', venue: '' },
        tables,
        fixtures: d.fixtures ?? [],
        guests,
        collaborators: d.collaborators ?? [],
      },
    };
  },
};

export function migrate(envelope) {
  let env = envelope;
  while (env.version < FORMAT_VERSION) {
    const step = MIGRATIONS[env.version];
    if (!step) throw new LayoutError(`Layouts saved in format version ${env.version} can no longer be opened.`, 'version');
    env = step(env);
  }
  return env;
}

/** Parses and validates a saved layout (file text or decoded link). Returns normalised data. */
export function parseLayout(text) {
  let env;
  try {
    env = JSON.parse(text);
  } catch {
    throw new LayoutError('This file isn’t valid JSON, so it can’t be opened as a layout.', 'json');
  }
  if (!env || typeof env !== 'object' || Array.isArray(env)) {
    throw new LayoutError('This file doesn’t contain a seating layout.', 'format');
  }
  if (env.app !== APP_ID) {
    throw new LayoutError(`This file wasn’t created by ${APP_NAME}. Choose a “-layout.json” file saved from this app.`, 'app');
  }
  if (!Number.isInteger(env.version) || env.version < 0) {
    throw new LayoutError('This layout file has no recognisable version number.', 'version');
  }
  if (env.version > FORMAT_VERSION) {
    throw new LayoutError(`This layout was saved by a newer version of ${APP_NAME} (format ${env.version}). Please update and try again.`, 'version');
  }
  const migrated = migrate(env);
  try {
    return { data: normalizeData(migrated.data), savedAt: migrated.savedAt ?? null };
  } catch (err) {
    throw new LayoutError(`The layout file is damaged: ${err.message}`, 'data');
  }
}

/* ------------------------------------------------------------------ helpers */

export function safeFileName(name, fallback = 'seating') {
  const cleaned = String(name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9-_ ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 60);
  return cleaned || fallback;
}

function downloadBlob(blob, filename) {
  let url;
  try {
    url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    // Some embedded browsers block programmatic downloads; fall back to opening the file.
    if (url && window.open(url, '_blank')) return;
    throw new LayoutError('Your browser blocked the download. Check pop-up/download permissions and try again.', 'download');
  } finally {
    if (url) setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

const formatDate = (d = new Date()) =>
  d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

/* ------------------------------------------------------------------ JSON */

export function exportJson(data, name) {
  try {
    const filename = `${safeFileName(name || data.event?.name)}-layout.json`;
    const blob = new Blob([JSON.stringify(buildEnvelope(data), null, 2)], { type: 'application/json' });
    downloadBlob(blob, filename);
    return filename;
  } catch (err) {
    if (err instanceof LayoutError) throw err;
    throw new LayoutError('The layout could not be saved to a file.', 'save');
  }
}

export async function importJson(file) {
  if (!file) throw new LayoutError('No file was selected.', 'file');
  if (!/\.json$/i.test(file.name) && file.type && !file.type.includes('json')) {
    throw new LayoutError(`“${file.name}” isn’t a .json layout file.`, 'file');
  }
  if (file.size > MAX_FILE_BYTES) throw new LayoutError('This file is too large to be a layout (over 5 MB).', 'file');
  let text;
  try {
    text = await file.text();
  } catch {
    throw new LayoutError('The file could not be read. It may have been moved or is still downloading.', 'file');
  }
  return parseLayout(text);
}

/* ------------------------------------------------------------------ image + PDF */

/**
 * Renders the layout node to a PNG data URL, cropped to `bounds` (world coordinates).
 * Elements with the `no-export` class are left out, and `.is-exporting` hides the grid and handles.
 */
async function renderLayout(node, bounds, scale = 2) {
  if (!node) throw new LayoutError('Nothing to export yet.', 'export');
  const { toPng } = await import('html-to-image');
  let pixelRatio = scale;
  while (pixelRatio > 0.5 && bounds.w * bounds.h * pixelRatio * pixelRatio > MAX_CANVAS_PIXELS) pixelRatio -= 0.25;

  node.classList.add('is-exporting');
  try {
    return {
      pixelRatio,
      dataUrl: await toPng(node, {
        pixelRatio,
        width: bounds.w,
        height: bounds.h,
        backgroundColor: '#fffdf8',
        cacheBust: true,
        filter: (el) => !(el.classList && el.classList.contains('no-export')),
        style: { transform: `translate(${-bounds.x}px, ${-bounds.y}px)`, transformOrigin: '0 0' },
      }),
    };
  } catch (err) {
    console.error(err);
    throw new LayoutError('The layout is too large or complex to render as an image on this device. Try zooming to fewer tables or saving to file instead.', 'render');
  } finally {
    node.classList.remove('is-exporting');
  }
}

export async function exportPng(node, { bounds, name }) {
  const { dataUrl } = await renderLayout(node, bounds, 2);
  const blob = await (await fetch(dataUrl)).blob();
  const filename = `${safeFileName(name)}-layout.png`;
  downloadBlob(blob, filename);
  return filename;
}

export async function exportPdf(node, { bounds, title, subtitle, name }) {
  const [{ dataUrl }, { jsPDF }] = await Promise.all([renderLayout(node, bounds, 2), import('jspdf')]);
  try {
    // Page matches the layout's aspect ratio and orientation, plus a header band for title + date.
    const margin = 36;
    const header = 64;
    const scale = Math.min(1, 1100 / Math.max(bounds.w, bounds.h)) * 0.75; // px -> pt, capped size
    const imgW = bounds.w * scale;
    const imgH = bounds.h * scale;
    const pageW = imgW + margin * 2;
    const pageH = imgH + margin * 2 + header;
    const doc = new jsPDF({ orientation: pageW >= pageH ? 'landscape' : 'portrait', unit: 'pt', format: [pageW, pageH] });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(31, 42, 36);
    doc.text(title || 'Seating plan', margin, margin + 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(110, 102, 92);
    doc.text([subtitle, `Exported ${formatDate()}`].filter(Boolean).join('  ·  '), margin, margin + 38);
    doc.addImage(dataUrl, 'PNG', margin, margin + header, imgW, imgH);
    const filename = `${safeFileName(name)}-layout.pdf`;
    downloadBlob(doc.output('blob'), filename);
    return filename;
  } catch (err) {
    if (err instanceof LayoutError) throw err;
    throw new LayoutError('The PDF could not be created.', 'pdf');
  }
}

/** Guest list as a printable PDF, grouped by table. */
export async function exportGuestListPdf(data, name) {
  const { jsPDF } = await import('jspdf');
  try {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 48;
    let y = M;
    const statusLabel = Object.fromEntries(RSVP_STATUSES.map((s) => [s.value, s.label]));
    const ensure = (needed) => {
      if (y + needed > H - M) {
        doc.addPage();
        y = M;
      }
    };

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(31, 42, 36);
    doc.text(data.event.name || 'Guest list', M, y + 8);
    y += 30;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(110, 102, 92);
    const seated = data.guests.filter((g) => g.tableId).length;
    doc.text(
      [data.event.date, data.event.venue, `${data.guests.length} guests · ${seated} seated`, `Exported ${formatDate()}`]
        .filter(Boolean)
        .join('  ·  '),
      M,
      y,
    );
    y += 28;

    const groups = data.tables.map((t, i) => ({
      title: tableName(t, i),
      meta: `${data.guests.filter((g) => g.tableId === t.id).length}/${t.seats}`,
      guests: data.guests.filter((g) => g.tableId === t.id).sort((a, b) => a.seat - b.seat),
    }));
    const unseated = data.guests.filter((g) => !g.tableId);
    if (unseated.length) groups.push({ title: 'Not yet seated', meta: String(unseated.length), guests: unseated });

    groups.forEach((group) => {
      ensure(48);
      doc.setDrawColor(230, 222, 210);
      doc.line(M, y, W - M, y);
      y += 20;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(31, 42, 36);
      doc.text(group.title, M, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(192, 100, 63);
      doc.text(group.meta, W - M, y, { align: 'right' });
      y += 18;
      if (!group.guests.length) {
        doc.setTextColor(150, 140, 128);
        doc.text('No guests seated', M + 12, y);
        y += 16;
      }
      group.guests.forEach((g) => {
        ensure(16);
        doc.setTextColor(40, 36, 32);
        doc.setFontSize(10.5);
        const seatNo = g.tableId ? `${g.seat + 1}. ` : '• ';
        doc.text(`${seatNo}${g.name}`, M + 12, y);
        doc.setTextColor(120, 112, 102);
        doc.setFontSize(9);
        const extra = [g.group, g.meal, statusLabel[g.rsvp]].filter(Boolean).join(' · ');
        doc.text(doc.splitTextToSize(extra, W / 2 - M)[0] ?? '', W - M, y, { align: 'right' });
        y += 16;
      });
      y += 6;
    });

    const filename = `${safeFileName(name)}-guest-list.pdf`;
    downloadBlob(doc.output('blob'), filename);
    return filename;
  } catch (err) {
    if (err instanceof LayoutError) throw err;
    throw new LayoutError('The guest list PDF could not be created.', 'pdf');
  }
}

/* ------------------------------------------------------------------ share link */

export function createShareLink(data, baseUrl = `${window.location.origin}/plan`) {
  try {
    const encoded = compressToEncodedURIComponent(JSON.stringify(buildEnvelope(data)));
    const url = `${baseUrl}#data=${encoded}`;
    return { url, length: url.length, tooLong: url.length > SHARE_LINK_WARN_LENGTH };
  } catch {
    throw new LayoutError('A share link could not be created for this layout.', 'share');
  }
}

/** Returns parsed layout data if the hash contains a shared layout, null if not, or throws LayoutError. */
export function loadFromShareLink(hash = window.location.hash) {
  const match = /(?:^#|&)data=([^&]+)/.exec(hash || '');
  if (!match) return null;
  let text;
  try {
    text = decompressFromEncodedURIComponent(match[1]);
  } catch {
    text = null;
  }
  if (!text) throw new LayoutError('This share link is incomplete or damaged. Ask for the link again, or for the layout file.', 'share');
  return parseLayout(text);
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
