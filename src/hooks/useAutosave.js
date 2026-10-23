import { useCallback, useEffect, useRef, useState } from 'react';
import { draftStore } from '../lib/storage.js';

/**
 * Debounced autosave of `value` to a draft store, plus flushes on tab hide / unload so the
 * last edit is never lost. Returns { status, savedAt, flush, clear, skipNext }.
 * status: 'saved' | 'saving' | 'error' | 'unavailable' | 'paused'
 */
export function useAutosave(value, { enabled = true, delay = 500, store = draftStore, initialSavedAt = null } = {}) {
  const [status, setStatus] = useState(store.available ? 'saved' : 'unavailable');
  const [savedAt, setSavedAt] = useState(initialSavedAt);
  const latest = useRef(value);
  const pending = useRef(false);
  const timer = useRef(null);
  const enabledRef = useRef(enabled);
  const persisted = useRef(value); // value already in storage (initial load); never re-saved
  const skip = useRef(false);

  enabledRef.current = enabled;

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (!pending.current || !enabledRef.current) return;
    pending.current = false;
    const result = store.save(latest.current);
    if (result.ok) {
      setStatus('saved');
      setSavedAt(result.savedAt);
    } else {
      setStatus(result.reason === 'unavailable' ? 'unavailable' : 'error');
    }
  }, [store]);

  useEffect(() => {
    latest.current = value;
    if (value === persisted.current) return;
    if (skip.current) {
      skip.current = false;
      persisted.current = value;
      return;
    }
    if (!enabled) {
      setStatus('paused');
      return;
    }
    pending.current = true;
    setStatus('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  }, [value, enabled, delay, flush]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  /** Don't persist the next change (it came from storage itself, e.g. another tab or a cleared draft). */
  const skipNext = useCallback(() => {
    skip.current = true;
    pending.current = false;
    clearTimeout(timer.current);
  }, []);

  const clear = useCallback(() => {
    clearTimeout(timer.current);
    pending.current = false;
    const ok = store.clear();
    setSavedAt(null);
    return ok;
  }, [store]);

  return { status, savedAt, flush, clear, skipNext };
}
