import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import Canvas from '../components/planner/Canvas.jsx';
import LayoutPanel, { PALETTE_MIME } from '../components/planner/LayoutPanel.jsx';
import GuestPanel from '../components/planner/GuestPanel.jsx';
import DetailsPanel from '../components/planner/DetailsPanel.jsx';
import { Menu, useConfirm, useMediaQuery, useToasts } from '../components/planner/ui.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { CollaboratorsDialog, ImportDialog, SaveFileDialog, ShareDialog, TemplatesDialog } from '../components/planner/dialogs.jsx';
import { historyReducer, initHistory, firstFreeSeat } from '../lib/planReducer.js';
import { createDefaultData, createFixture, createTable, contentBounds, isEmptyLayout, tableName, WORLD, uid } from '../lib/model.js';
import { applyTemplate } from '../lib/templates.js';
import { draftStore } from '../lib/storage.js';
import { useAutosave } from '../hooks/useAutosave.js';
import { exportGuestListPdf, exportJson, exportPdf, exportPng, importJson, loadFromShareLink, safeFileName } from '../lib/layoutStorage.js';

const DEFAULT_VIEW = { zoom: 0.8, scrollLeft: 0, scrollTop: 0, panel: 'layout' };
const isTyping = (el) => el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
const clearHash = () => {
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch {
    /* ignore */
  }
};

/** Reads the share link and the saved draft once, before first render. */
function boot() {
  let shared = null;
  let shareError = null;
  let invite = null;
  try {
    shared = loadFromShareLink();
    if (shared) {
      const params = new URLSearchParams(window.location.hash.slice(1));
      if (params.get('invite')) invite = { name: params.get('to') || 'there', role: params.get('role') === 'viewer' ? 'viewer' : 'editor' };
    }
  } catch (err) {
    shareError = err.message;
    clearHash();
  }
  const draft = draftStore.load();
  return { shared, shareError, invite, draft };
}

function SaveIndicator({ status, savedAt }) {
  const map = {
    saving: { text: 'Saving…', tone: 'saving' },
    saved: { text: savedAt ? 'Saved' : 'All changes saved', tone: 'ok' },
    error: { text: 'Not saved', tone: 'error' },
    unavailable: { text: 'Autosave off', tone: 'error' },
    paused: { text: 'Read-only', tone: 'muted' },
  };
  const s = map[status] ?? map.saved;
  const title =
    status === 'unavailable'
      ? 'Browser storage is unavailable (private mode or blocked). Use “Save to file” to keep your work.'
      : status === 'error'
        ? 'Your browser storage is full or blocked. Use “Save to file” to keep your work.'
        : savedAt
          ? `Saved in this browser at ${new Date(savedAt).toLocaleTimeString()}`
          : 'Changes are saved automatically in this browser.';
  return (
    <span className={`save-indicator tone-${s.tone}`} role="status" aria-live="polite" title={title}>
      <i aria-hidden="true" />
      {s.text}
    </span>
  );
}

export default function Planner() {
  const [initial] = useState(boot);
  const [mode, setMode] = useState(initial.shared ? 'shared' : 'edit');
  const readOnly = mode === 'shared';
  const [hist, dispatch] = useReducer(historyReducer, initial.shared?.data ?? initial.draft?.data.layout ?? createDefaultData(), initHistory);
  const layout = hist.present;
  const [view, setView] = useState(() => (initial.shared ? DEFAULT_VIEW : initial.draft?.data.view ?? DEFAULT_VIEW));
  const draftValue = useMemo(() => ({ layout, view }), [layout, view]);
  const autosave = useAutosave(draftValue, { enabled: !readOnly, initialSavedAt: initial.draft?.savedAt });

  const [selected, setSelected] = useState(null);
  const [pendingGuestId, setPendingGuestId] = useState(null);
  const [snap, setSnap] = useState(true);
  const [fitSignal, setFitSignal] = useState(0);
  const [dialog, setDialog] = useState(null); // 'save' | 'share' | 'collab' | 'templates' | 'import'
  const [importFile, setImportFile] = useState(null);
  const [busy, setBusy] = useState(null);
  const [fileDrag, setFileDrag] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const isNarrow = useMediaQuery('(max-width: 1000px)');

  const [toastView, toast] = useToasts();
  const [confirmView, confirm] = useConfirm();
  const worldRef = useRef(null);
  const fileInputRef = useRef(null);
  const rootRef = useRef(null);
  const fileSnapshot = useRef(initial.shared ? JSON.stringify(initial.shared.data) : null);

  const isDirty = () => !isEmptyLayout(layout) && JSON.stringify(layout) !== fileSnapshot.current;
  const panel = isNarrow ? view.panel : view.panel === 'details' ? 'layout' : view.panel;
  const setPanel = (p) => setView((v) => ({ ...v, panel: p }));

  /* ------------------------------------------------------------ boot messages + entrance */

  const bootToastShown = useRef(false);
  useEffect(() => {
    if (bootToastShown.current) return;
    bootToastShown.current = true;
    if (initial.shareError) toast(initial.shareError, 'error', 8000);
    else if (initial.draft && !initial.shared && !isEmptyLayout(initial.draft.data.layout)) toast('Welcome back — your plan was restored.', 'success');
  }, [initial, toast]);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.planner-top', { y: -24, opacity: 0, duration: 0.5, ease: 'power3.out' });
      gsap.from('.sidebar, .inspector', { opacity: 0, x: (i) => (i ? 24 : -24), duration: 0.55, ease: 'power3.out', delay: 0.08 });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  // A share link pasted into an already-open planner tab only changes the hash; reload to open it.
  useEffect(() => {
    const onHash = () => {
      if (/(?:^#|&)data=/.test(window.location.hash)) {
        autosave.flush();
        window.location.reload();
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [autosave]);

  /* ------------------------------------------------------------ live updates from other tabs */

  useEffect(() => {
    if (readOnly) return undefined;
    return draftStore.subscribe((remote) => {
      if (!remote) return;
      if (JSON.stringify(remote.data.layout) === JSON.stringify(layout)) return;
      autosave.skipNext();
      dispatch({ type: 'replace', data: remote.data.layout, history: false });
    });
  }, [readOnly, layout, autosave]);

  /* ------------------------------------------------------------ editing helpers */

  const viewCenter = () => {
    const vp = document.querySelector('.canvas-viewport');
    if (!vp) return { x: WORLD.width / 2, y: WORLD.height / 2 };
    const n = (layout.tables.length + layout.fixtures.length) % 6;
    return { x: (vp.scrollLeft + vp.clientWidth / 2) / view.zoom + n * 24, y: (vp.scrollTop + vp.clientHeight / 2) / view.zoom + n * 24 };
  };

  const nextTableLabel = () => {
    const nums = layout.tables.map((t) => parseInt(t.label, 10)).filter(Number.isFinite);
    return String(Math.max(layout.tables.length, ...nums, 0) + 1);
  };

  const addTable = ({ shape, seats }, pos = viewCenter()) => {
    const table = createTable({ shape, seats, x: Math.round(pos.x / 10) * 10, y: Math.round(pos.y / 10) * 10, label: nextTableLabel() });
    dispatch({ type: 'table/add', table });
    setSelected({ kind: 'table', id: table.id });
  };

  const addFixture = (kind, pos = viewCenter()) => {
    const fixture = createFixture(kind, Math.round(pos.x / 10) * 10, Math.round(pos.y / 10) * 10);
    dispatch({ type: 'fixture/add', fixture });
    setSelected({ kind: 'fixture', id: fixture.id });
  };

  const duplicateTable = (id) => {
    const t = layout.tables.find((x) => x.id === id);
    if (!t) return;
    const copy = { ...t, id: uid('t'), x: Math.min(WORLD.width, t.x + 60), y: Math.min(WORLD.height, t.y + 60), label: nextTableLabel() };
    dispatch({ type: 'table/add', table: copy });
    setSelected({ kind: 'table', id: copy.id });
  };

  const deleteItem = (sel) => {
    if (!sel || readOnly) return;
    if (sel.kind === 'table') {
      const idx = layout.tables.findIndex((t) => t.id === sel.id);
      if (idx < 0) return;
      dispatch({ type: 'table/remove', id: sel.id });
      toast(`${tableName(layout.tables[idx], idx)} deleted. Press Ctrl/⌘+Z to undo.`);
    } else {
      dispatch({ type: 'fixture/remove', id: sel.id });
    }
    setSelected(null);
  };

  const select = useCallback(
    (sel) => {
      setSelected(sel);
      if (sel && isNarrow && sheetOpen) setView((v) => ({ ...v, panel: 'details' }));
    },
    [isNarrow, sheetOpen],
  );

  const seatGuest = useCallback(
    (guestId, tableId, seat) => {
      if (readOnly) return;
      const guest = layout.guests.find((g) => g.id === guestId);
      const idx = layout.tables.findIndex((t) => t.id === tableId);
      if (!guest || idx < 0) return;
      if (seat === undefined && guest.tableId !== tableId && firstFreeSeat(layout, tableId) < 0) {
        toast(`${tableName(layout.tables[idx], idx)} is full.`, 'error');
        return;
      }
      if (seat === undefined && guest.tableId === tableId) return;
      dispatch({ type: 'guest/seat', guestId, tableId, seat });
    },
    [layout, readOnly, toast],
  );

  const onSeatClick = useCallback(
    (tableId, seat, occupant) => {
      if (!readOnly && pendingGuestId) {
        seatGuest(pendingGuestId, tableId, seat);
        setPendingGuestId(null);
        return;
      }
      if (!readOnly && occupant) {
        setPendingGuestId(occupant.id);
        toast(`Moving ${occupant.name} — tap another seat to place them.`);
        return;
      }
      select({ kind: 'table', id: tableId });
    },
    [pendingGuestId, readOnly, seatGuest, select, toast],
  );

  const onSeatDrop = useCallback((guestId, tableId, seat) => seatGuest(guestId, tableId, seat), [seatGuest]);
  const onTableDrop = useCallback((guestId, tableId) => seatGuest(guestId, tableId), [seatGuest]);

  const onPaletteDrop = (payload, pos) => {
    if (readOnly) return;
    if (payload.type === 'table') addTable(payload, pos);
    else if (payload.type === 'fixture') addFixture(payload.kind, pos);
  };

  /* ------------------------------------------------------------ file: save / open */

  const loadLayout = (data, message) => {
    dispatch({ type: 'replace', data }); // recorded in history, so Undo can bring the previous plan back
    fileSnapshot.current = JSON.stringify(data);
    setSelected(null);
    setPendingGuestId(null);
    setFitSignal((n) => n + 1);
    if (message) toast(message, 'success');
  };

  const saveToFile = (name) => {
    try {
      const filename = exportJson(layout, name);
      fileSnapshot.current = JSON.stringify(layout);
      setDialog(null);
      toast(`Saved ${filename}`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const openLayoutFile = async (file) => {
    if (readOnly) {
      toast('Open an editable copy first, then open your file.', 'error');
      return;
    }
    let result;
    try {
      result = await importJson(file);
    } catch (err) {
      toast(err.message || 'That file could not be opened.', 'error', 8000);
      return; // current work is untouched
    }
    if (isDirty()) {
      const ok = await confirm({
        title: 'Replace your current plan?',
        message: `You have changes that haven’t been saved to a file. Opening “${file.name}” will replace them (you can still undo).`,
        confirmLabel: 'Open file',
      });
      if (!ok) return;
    }
    loadLayout(result.data, `Opened ${file.name}`);
  };

  const onFileInput = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) openLayoutFile(file);
  };

  const routeDroppedFile = (file) => {
    if (/\.json$/i.test(file.name)) openLayoutFile(file);
    else if (/\.(csv|tsv|txt|xlsx|xls|ods)$/i.test(file.name)) {
      if (readOnly) return toast('Open an editable copy to import guests.', 'error');
      setImportFile(file);
      setDialog('import');
    } else toast(`“${file.name}” isn’t a layout (.json) or guest spreadsheet (.csv, .xlsx).`, 'error');
  };

  // Drop a layout file (or a guest spreadsheet) anywhere on the page.
  const dropRef = useRef(routeDroppedFile);
  dropRef.current = routeDroppedFile;
  useEffect(() => {
    let depth = 0;
    const isFiles = (e) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e) => {
      if (!isFiles(e)) return;
      depth += 1;
      setFileDrag(true);
    };
    const over = (e) => {
      if (isFiles(e)) e.preventDefault();
    };
    const leave = (e) => {
      if (!isFiles(e)) return;
      depth -= 1;
      if (depth <= 0) setFileDrag(false);
    };
    const drop = (e) => {
      if (!isFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setFileDrag(false);
      const file = e.dataTransfer.files?.[0];
      if (file) dropRef.current(file);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);

  /* ------------------------------------------------------------ exports */

  const runExport = async (kind) => {
    if (busy) return;
    if (kind !== 'guests' && !layout.tables.length && !layout.fixtures.length) {
      toast('Add some tables before exporting the layout.', 'error');
      return;
    }
    setBusy(kind);
    setPendingGuestId(null);
    try {
      const bounds = contentBounds(layout);
      const subtitle = [layout.event.date && new Date(`${layout.event.date}T00:00`).toLocaleDateString(undefined, { dateStyle: 'long' }), layout.event.venue].filter(Boolean).join(' · ');
      let filename;
      if (kind === 'png') filename = await exportPng(worldRef.current, { bounds, name: layout.event.name });
      if (kind === 'pdf') filename = await exportPdf(worldRef.current, { bounds, name: layout.event.name, title: layout.event.name, subtitle });
      if (kind === 'guests') filename = await exportGuestListPdf(layout, layout.event.name);
      toast(`Downloaded ${filename}`, 'success');
    } catch (err) {
      toast(err.message || 'Export failed.', 'error', 8000);
    } finally {
      setBusy(null);
    }
  };

  /* ------------------------------------------------------------ templates, start new, shared mode */

  const applyTemplateById = async (id) => {
    if (layout.tables.length || layout.fixtures.length) {
      const ok = await confirm({ title: 'Replace the room layout?', message: 'Your current tables and room features will be replaced. Guests are kept but unseated. You can undo this.', confirmLabel: 'Use template' });
      if (!ok) return;
    }
    dispatch({ type: 'replace', data: applyTemplate(id, layout) });
    setSelected(null);
    setDialog(null);
    setFitSignal((n) => n + 1);
  };

  const startNew = async () => {
    const ok = await confirm({
      title: 'Clear saved draft and start new?',
      message: 'This deletes the autosaved plan from this browser and starts a blank one. Save to file first if you want to keep it.',
      confirmLabel: 'Clear and start new',
      danger: true,
    });
    if (!ok) return;
    const cleared = autosave.clear();
    autosave.skipNext();
    dispatch({ type: 'reset', data: createDefaultData() });
    setView(DEFAULT_VIEW);
    setSelected(null);
    setPendingGuestId(null);
    fileSnapshot.current = null;
    toast(cleared ? 'Draft cleared. Starting fresh.' : 'Started a new plan, but the old draft could not be removed from storage.', cleared ? 'success' : 'error');
  };

  const openEditableCopy = async () => {
    const existing = draftStore.load();
    if (existing && !isEmptyLayout(existing.data.layout)) {
      const ok = await confirm({
        title: 'Replace your saved plan?',
        message: 'Making an editable copy replaces the plan autosaved in this browser. Save that one to a file first if you need it.',
        confirmLabel: 'Make editable copy',
      });
      if (!ok) return;
    }
    clearHash();
    setMode('edit');
    dispatch({ type: 'reset', data: { ...layout } });
    fileSnapshot.current = JSON.stringify(layout);
    toast('This copy is now yours to edit. It saves automatically in this browser.', 'success');
  };

  const backToMyPlan = () => {
    clearHash();
    const draft = draftStore.load();
    autosave.skipNext();
    setMode('edit');
    dispatch({ type: 'reset', data: draft?.data.layout ?? createDefaultData() });
    setView(draft?.data.view ?? DEFAULT_VIEW);
    fileSnapshot.current = null;
    setFitSignal((n) => n + 1);
  };

  /* ------------------------------------------------------------ keyboard */

  const keyRef = useRef(null);
  keyRef.current = (e) => {
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    if (mod && key === 's') {
      e.preventDefault();
      setDialog('save');
      return;
    }
    if (mod && key === 'o') {
      e.preventDefault();
      fileInputRef.current?.click();
      return;
    }
    if (isTyping(e.target) || document.querySelector('dialog[open]') || readOnly) return;
    if (mod && key === 'z') {
      e.preventDefault();
      dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
    } else if (mod && key === 'y') {
      e.preventDefault();
      dispatch({ type: 'redo' });
    } else if (e.key === 'Escape') {
      setSelected(null);
      setPendingGuestId(null);
    } else if (selected && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      deleteItem(selected);
    } else if (selected && key === 'r' && !mod) {
      const item = (selected.kind === 'table' ? layout.tables : layout.fixtures).find((x) => x.id === selected.id);
      if (item) dispatch({ type: selected.kind === 'table' ? 'table/update' : 'fixture/update', id: item.id, patch: { rotation: (item.rotation + (e.shiftKey ? -15 : 15) + 360) % 360 }, coalesce: `rot-${item.id}` });
    } else if (selected && e.key.startsWith('Arrow')) {
      const item = (selected.kind === 'table' ? layout.tables : layout.fixtures).find((x) => x.id === selected.id);
      if (!item) return;
      e.preventDefault();
      const step = e.shiftKey ? 1 : 10;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      dispatch({ type: 'item/move', kind: selected.kind, id: item.id, x: Math.min(WORLD.width, Math.max(0, item.x + dx)), y: Math.min(WORLD.height, Math.max(0, item.y + dy)), coalesce: `nudge-${item.id}` });
    }
  };
  useEffect(() => {
    const onKey = (e) => keyRef.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Drop a stale selection (e.g. after undo removed the item).
  useEffect(() => {
    if (!selected) return;
    const list = selected.kind === 'table' ? layout.tables : layout.fixtures;
    if (!list.some((x) => x.id === selected.id)) setSelected(null);
  }, [layout, selected]);

  /* ------------------------------------------------------------ render */

  const stats = useMemo(
    () => ({
      tables: layout.tables.length,
      capacity: layout.tables.reduce((n, t) => n + t.seats, 0),
      seated: layout.guests.filter((g) => g.tableId).length,
    }),
    [layout],
  );

  const fileMenu = [
    { label: 'Save to file…', hint: '⌘S', onSelect: () => setDialog('save') },
    { label: 'Open file…', hint: '⌘O', disabled: readOnly, onSelect: () => fileInputRef.current?.click() },
    'divider',
    { label: busy === 'png' ? 'Rendering PNG…' : 'Download PNG', disabled: Boolean(busy), onSelect: () => runExport('png') },
    { label: busy === 'pdf' ? 'Rendering PDF…' : 'Download layout PDF', disabled: Boolean(busy), onSelect: () => runExport('pdf') },
    { label: 'Download guest list PDF', disabled: Boolean(busy), onSelect: () => runExport('guests') },
    'divider',
    { label: 'Copy share link…', onSelect: () => setDialog('share') },
    ...(isNarrow ? [{ label: 'Collaborators…', onSelect: () => setDialog('collab') }] : []),
    'divider',
    { label: 'Clear saved draft / Start new', danger: true, disabled: readOnly, onSelect: startNew },
  ];

  const tabs = [
    { id: 'layout', label: 'Layout' },
    { id: 'guests', label: `Guests${layout.guests.length ? ` · ${layout.guests.length}` : ''}` },
    ...(isNarrow ? [{ id: 'details', label: selected ? 'Selected' : 'Event' }] : []),
  ];

  const pendingGuest = pendingGuestId && layout.guests.find((g) => g.id === pendingGuestId);

  return (
    <div className={`planner${isNarrow ? ' is-narrow' : ''}`} ref={rootRef}>
      <header className="planner-top">
        <Link to="/" className="brand" aria-label="Seatcraft home">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Seatcraft</span>
        </Link>
        <label className="event-title">
          <span className="sr-only">Event name</span>
          <input value={layout.event.name} readOnly={readOnly} maxLength={120} onChange={(e) => dispatch({ type: 'event/update', patch: { name: e.target.value }, coalesce: 'event-name' })} />
        </label>
        <SaveIndicator status={autosave.status} savedAt={autosave.savedAt} />
        <div className="top-actions">
          <ThemeToggle />
          {!readOnly && (
            <div className="row gap-xs">
              <button type="button" className="icon-btn" onClick={() => dispatch({ type: 'undo' })} disabled={!hist.past.length} aria-label="Undo" title="Undo (⌘Z)">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <button type="button" className="icon-btn" onClick={() => dispatch({ type: 'redo' })} disabled={!hist.future.length} aria-label="Redo" title="Redo (⇧⌘Z)">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
          )}
          {!isNarrow && (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => fileInputRef.current?.click()} disabled={readOnly}>Open file</button>
              <button type="button" className="btn btn-ghost" onClick={() => setDialog('save')}>Save to file</button>
              <button type="button" className="btn btn-ghost collab-btn" onClick={() => setDialog('collab')} aria-label={`Collaborators (${layout.collaborators.length})`}>
                <span className="avatar-stack" aria-hidden="true">
                  {layout.collaborators.slice(0, 3).map((c) => <span key={c.id} className="avatar">{c.name.slice(0, 1).toUpperCase()}</span>)}
                  {!layout.collaborators.length && <span className="avatar avatar-add">+</span>}
                </span>
                <span>Collaborators</span>
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setDialog('share')}>Share</button>
            </>
          )}
          <Menu label={isNarrow ? '' : 'More'} buttonClass={isNarrow ? 'icon-btn' : 'btn'} icon={isNarrow ? <svg viewBox="0 0 24 24" width="20" height="20" aria-label="Menu"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> : null} items={fileMenu} />
        </div>
        <input ref={fileInputRef} type="file" accept=".json,application/json" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onFileInput} />
      </header>

      {readOnly && (
        <div className="shared-banner" role="status">
          <span>
            {initial.invite
              ? <>Hi {initial.invite.name}! You’ve been invited to {initial.invite.role === 'editor' ? 'help edit' : 'view'} <strong>{layout.event.name}</strong>.</>
              : <>You’re viewing a shared seating plan — <strong>read-only</strong>.</>}
          </span>
          <span className="row gap-sm">
            {initial.invite?.role !== 'viewer' && <button type="button" className="btn btn-sm btn-primary" onClick={openEditableCopy}>Open an editable copy</button>}
            <button type="button" className="btn btn-sm" onClick={backToMyPlan}>Go to my plan</button>
          </span>
        </div>
      )}

      <div className="planner-body">
        <aside className={`sidebar${isNarrow ? ` sheet${sheetOpen ? ' is-open' : ''}` : ''}`} aria-label="Planner panels">
          <div className="tabs" role="tablist" aria-label="Panels">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={panel === t.id}
                aria-controls="panel-main"
                className={panel === t.id ? 'is-active' : ''}
                onClick={() => {
                  if (isNarrow && panel === t.id) setSheetOpen((o) => !o);
                  else {
                    setPanel(t.id);
                    if (isNarrow) setSheetOpen(true);
                  }
                }}
              >
                {t.label}
              </button>
            ))}
            {isNarrow && (
              <button type="button" className="icon-btn sheet-toggle" aria-label={sheetOpen ? 'Collapse panel' : 'Expand panel'} aria-expanded={sheetOpen} onClick={() => setSheetOpen((o) => !o)}>
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" style={{ transform: sheetOpen ? 'rotate(180deg)' : 'none' }}><path d="m6 15 6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
            )}
          </div>
          <div id="panel-main" role="tabpanel" aria-labelledby={`tab-${panel}`} className="tab-panel" hidden={isNarrow && !sheetOpen}>
            {panel === 'layout' && <LayoutPanel onAddTable={(p) => addTable(p)} onAddFixture={(k) => addFixture(k)} onOpenTemplates={() => setDialog('templates')} snap={snap} setSnap={setSnap} readOnly={readOnly} stats={stats} />}
            {panel === 'guests' && (
              <GuestPanel
                data={layout}
                dispatch={dispatch}
                readOnly={readOnly}
                pendingGuestId={pendingGuestId}
                setPendingGuestId={(v) => {
                  setPendingGuestId(v);
                  if (isNarrow) setSheetOpen(false);
                }}
                onImport={() => {
                  setImportFile(null);
                  setDialog('import');
                }}
                onSeatAt={(guestId, tableId) => seatGuest(guestId, tableId)}
                toast={toast}
              />
            )}
            {panel === 'details' && <DetailsPanel data={layout} selected={selected} dispatch={dispatch} readOnly={readOnly} onDuplicate={duplicateTable} onDelete={deleteItem} toast={toast} />}
          </div>
        </aside>

        <main className="canvas-area" onDragOver={(e) => {
          if (!readOnly && Array.from(e.dataTransfer.types).includes(PALETTE_MIME)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }
        }} onDrop={(e) => {
          const raw = e.dataTransfer.getData(PALETTE_MIME);
          if (!raw) return;
          e.preventDefault();
          const vp = document.querySelector('.canvas-viewport');
          const rect = vp.getBoundingClientRect();
          try {
            onPaletteDrop(JSON.parse(raw), { x: (e.clientX - rect.left + vp.scrollLeft) / view.zoom, y: (e.clientY - rect.top + vp.scrollTop) / view.zoom });
          } catch {
            /* ignore malformed drag data */
          }
        }}>
          <Canvas
            ref={worldRef}
            data={layout}
            view={view}
            setView={setView}
            fitSignal={fitSignal}
            selected={selected}
            onSelect={select}
            pendingGuestId={pendingGuestId}
            readOnly={readOnly}
            snap={snap}
            dispatch={dispatch}
            onSeatClick={onSeatClick}
            onSeatDrop={onSeatDrop}
            onTableDrop={onTableDrop}
            onEmptyAction={(a) => (a === 'templates' ? setDialog('templates') : addTable({ shape: 'round', seats: 8 }))}
          />
          {pendingGuest && (
            <div className="floating-pick" role="status">
              Tap a seat for <strong>{pendingGuest.name}</strong>
              {pendingGuest.tableId && <button type="button" className="btn btn-sm" onClick={() => { dispatch({ type: 'guest/unseat', id: pendingGuest.id }); setPendingGuestId(null); }}>Unseat</button>}
              <button type="button" className="btn btn-sm" onClick={() => setPendingGuestId(null)}>Cancel</button>
            </div>
          )}
          {busy && busy !== 'guests' && <div className="busy-overlay" role="status">Rendering {busy.toUpperCase()}…</div>}
        </main>

        {!isNarrow && (
          <aside className="inspector" aria-label={selected ? 'Selected item' : 'Event details'}>
            <DetailsPanel data={layout} selected={selected} dispatch={dispatch} readOnly={readOnly} onDuplicate={duplicateTable} onDelete={deleteItem} toast={toast} />
          </aside>
        )}
      </div>

      {fileDrag && (
        <div className="file-drop-overlay" aria-hidden="true">
          <div>
            <strong>Drop to open</strong>
            <span>a saved <code>-layout.json</code>, or a guest list (.csv / .xlsx)</span>
          </div>
        </div>
      )}

      <SaveFileDialog open={dialog === 'save'} onClose={() => setDialog(null)} defaultName={safeFileName(layout.event.name, 'seating')} onSave={saveToFile} />
      <ShareDialog open={dialog === 'share'} onClose={() => setDialog(null)} data={layout} toast={toast} onSaveFile={() => setDialog('save')} />
      <CollaboratorsDialog open={dialog === 'collab'} onClose={() => setDialog(null)} data={layout} dispatch={dispatch} readOnly={readOnly} toast={toast} />
      <TemplatesDialog open={dialog === 'templates'} onClose={() => setDialog(null)} onApply={applyTemplateById} />
      <ImportDialog
        open={dialog === 'import'}
        onClose={() => setDialog(null)}
        initialFile={importFile}
        data={layout}
        onImport={(rows) => {
          dispatch({ type: 'guest/add', guests: rows.map((r) => r.guest) });
          let seated = 0;
          let draft = { ...layout, guests: [...layout.guests, ...rows.map((r) => r.guest)] };
          rows.forEach(({ guest, tableId }) => {
            if (!tableId) return;
            const seat = firstFreeSeat(draft, tableId);
            if (seat < 0) return;
            draft = { ...draft, guests: draft.guests.map((g) => (g.id === guest.id ? { ...g, tableId, seat } : g)) };
            dispatch({ type: 'guest/seat', guestId: guest.id, tableId, seat, coalesce: 'import' });
            seated += 1;
          });
          setDialog(null);
          setPanel('guests');
          toast(`Imported ${rows.length} guests${seated ? `, ${seated} seated at their tables` : ''}.`, 'success');
        }}
      />
      {confirmView}
      {toastView}
    </div>
  );
}
