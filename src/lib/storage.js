// Draft persistence (Task 2). Everything that touches browser storage lives here so it can be
// swapped for a database adapter later: any object with { available, load, save, clear, subscribe }
// can replace `draftStore` without changes elsewhere.

import { normalizeData, WORLD } from './model.js';

export const DRAFT_VERSION = 1;
const DRAFT_KEY = 'seatcraft:draft';

function getLocalStorage() {
  try {
    const ls = window.localStorage;
    const probe = '__seatcraft_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    // Private mode, disabled cookies, sandboxed iframe, etc.
    return null;
  }
}

/** Editor state = layout + view (zoom/scroll/panel) so a refresh restores exactly where you were. */
export function normalizeDraft(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Draft is empty.');
  const layout = normalizeData(raw.layout);
  const v = raw.view && typeof raw.view === 'object' ? raw.view : {};
  const n = (x, min, max, d) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : d);
  return {
    layout,
    view: {
      zoom: n(v.zoom, 0.25, 2.5, 0.8),
      scrollLeft: n(v.scrollLeft, 0, WORLD.width * 2.5, 0),
      scrollTop: n(v.scrollTop, 0, WORLD.height * 2.5, 0),
      panel: ['layout', 'guests', 'details'].includes(v.panel) ? v.panel : 'layout',
    },
  };
}

function parseEnvelope(text) {
  const env = JSON.parse(text);
  if (!env || typeof env !== 'object' || env.version !== DRAFT_VERSION || !('data' in env)) {
    throw new Error(`Unknown draft format (version ${env?.version ?? 'missing'}).`);
  }
  return { data: normalizeDraft(env.data), savedAt: typeof env.savedAt === 'string' ? env.savedAt : null };
}

export function createLocalStorageAdapter(key = DRAFT_KEY) {
  const ls = getLocalStorage();

  return {
    available: Boolean(ls),

    /** Returns { data, savedAt } or null. Never throws: corrupted or unknown drafts are ignored. */
    load() {
      if (!ls) return null;
      try {
        const text = ls.getItem(key);
        return text ? parseEnvelope(text) : null;
      } catch (err) {
        console.warn('[storage] Ignoring unreadable saved draft:', err);
        return null;
      }
    },

    /** Returns { ok: true, savedAt } or { ok: false, reason }. Never throws. */
    save(data) {
      if (!ls) return { ok: false, reason: 'unavailable' };
      try {
        const savedAt = new Date().toISOString();
        ls.setItem(key, JSON.stringify({ version: DRAFT_VERSION, savedAt, data }));
        return { ok: true, savedAt };
      } catch (err) {
        const quota = err?.name === 'QuotaExceededError' || err?.code === 22;
        console.warn('[storage] Could not save draft:', err);
        return { ok: false, reason: quota ? 'quota' : 'error' };
      }
    },

    clear() {
      if (!ls) return true;
      try {
        ls.removeItem(key);
        return true;
      } catch (err) {
        console.warn('[storage] Could not clear draft:', err);
        return false;
      }
    },

    /** Notifies when another tab changes the draft (live updates across tabs). */
    subscribe(callback) {
      if (!ls) return () => {};
      const onStorage = (e) => {
        if (e.key !== key) return;
        if (!e.newValue) return callback(null);
        try {
          callback(parseEnvelope(e.newValue));
        } catch (err) {
          console.warn('[storage] Ignoring invalid update from another tab:', err);
        }
      };
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    },
  };
}

export const draftStore = createLocalStorageAdapter();
