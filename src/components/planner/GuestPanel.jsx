import { memo, useMemo, useState } from 'react';
import { createGuest, RSVP_STATUSES, tableName } from '../../lib/model.js';
import { parsePastedNames } from '../../lib/importGuests.js';
import { GUEST_MIME, hasGuestData } from './Canvas.jsx';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'unseated', label: 'Unseated' },
  { value: 'seated', label: 'Seated' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'pending', label: 'Pending' },
  { value: 'declined', label: 'Declined' },
];

const GuestRow = memo(function GuestRow({ guest, tables, tableLabel, readOnly, isPending, expanded, onToggleExpand, onPick, onSeatAt, dispatch }) {
  const [draftName, setDraftName] = useState(null);
  const update = (patch, coalesce) => dispatch({ type: 'guest/update', id: guest.id, patch, coalesce });

  const commitName = () => {
    if (draftName !== null && draftName.trim() && draftName.trim() !== guest.name) update({ name: draftName.trim().slice(0, 80) });
    setDraftName(null);
  };

  return (
    <li
      className={`guest-row rsvp-${guest.rsvp}${isPending ? ' is-pending' : ''}${guest.tableId ? ' is-seated' : ''}`}
      draggable={!readOnly && draftName === null}
      onDragStart={(e) => {
        e.dataTransfer.setData(GUEST_MIME, guest.id);
        e.dataTransfer.setData('text/plain', guest.name);
        e.dataTransfer.effectAllowed = 'move';
      }}
    >
      <div className="guest-main">
        <span className="rsvp-dot" aria-hidden="true" />
        {draftName !== null ? (
          <input
            className="input input-sm"
            value={draftName}
            autoFocus
            aria-label="Guest name"
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName();
              if (e.key === 'Escape') setDraftName(null);
            }}
          />
        ) : (
          <button
            type="button"
            className="guest-name"
            onClick={() => !readOnly && onPick(guest.id)}
            onDoubleClick={() => !readOnly && setDraftName(guest.name)}
            aria-pressed={isPending}
            title={readOnly ? guest.name : 'Click to pick up, then tap a seat · double-click to rename'}
          >
            <span>{guest.name}</span>
            <small>
              {guest.group && `${guest.group} · `}
              {tableLabel ? `${tableLabel}, seat ${guest.seat + 1}` : 'Not seated'}
            </small>
          </button>
        )}
        <button type="button" className="icon-btn" aria-expanded={expanded} aria-label={`More options for ${guest.name}`} onClick={onToggleExpand}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="5" cy="12" r="1.8" fill="currentColor" /><circle cx="12" cy="12" r="1.8" fill="currentColor" /><circle cx="19" cy="12" r="1.8" fill="currentColor" /></svg>
        </button>
      </div>
      <div className="guest-controls">
        <select className="select select-sm" value={guest.rsvp} disabled={readOnly} onChange={(e) => update({ rsvp: e.target.value })} aria-label={`RSVP status for ${guest.name}`}>
          {RSVP_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <select
          className="select select-sm"
          value={guest.tableId ?? ''}
          disabled={readOnly}
          aria-label={`Table for ${guest.name}`}
          onChange={(e) => (e.target.value ? onSeatAt(guest.id, e.target.value) : dispatch({ type: 'guest/unseat', id: guest.id }))}
        >
          <option value="">No table</option>
          {tables.map((t, i) => (
            <option key={t.id} value={t.id}>{tableName(t, i)}</option>
          ))}
        </select>
      </div>
      {expanded && (
        <div className="guest-details">
          <label className="field"><span>Name</span><input className="input input-sm" value={guest.name} disabled={readOnly} onChange={(e) => update({ name: e.target.value.slice(0, 80) }, `name-${guest.id}`)} /></label>
          <label className="field"><span>Group</span><input className="input input-sm" value={guest.group} disabled={readOnly} placeholder="e.g. Bride’s family" onChange={(e) => update({ group: e.target.value.slice(0, 60) }, `group-${guest.id}`)} /></label>
          <label className="field"><span>Email</span><input className="input input-sm" type="email" value={guest.email} disabled={readOnly} onChange={(e) => update({ email: e.target.value.slice(0, 120) }, `email-${guest.id}`)} /></label>
          <label className="field"><span>Meal / dietary</span><input className="input input-sm" value={guest.meal} disabled={readOnly} onChange={(e) => update({ meal: e.target.value.slice(0, 60) }, `meal-${guest.id}`)} /></label>
          <label className="field field-wide"><span>Notes</span><input className="input input-sm" value={guest.notes} disabled={readOnly} onChange={(e) => update({ notes: e.target.value.slice(0, 500) }, `notes-${guest.id}`)} /></label>
          <label className="switch field-wide">
            <input type="checkbox" checked={guest.invited} disabled={readOnly} onChange={(e) => update({ invited: e.target.checked })} />
            <span>Invitation sent</span>
          </label>
          {!readOnly && (
            <div className="row field-wide">
              {guest.tableId && <button type="button" className="btn btn-sm" onClick={() => dispatch({ type: 'guest/unseat', id: guest.id })}>Unseat</button>}
              <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => dispatch({ type: 'guest/remove', id: guest.id })}>Remove guest</button>
            </div>
          )}
        </div>
      )}
    </li>
  );
});

export default function GuestPanel({ data, dispatch, readOnly, pendingGuestId, setPendingGuestId, onImport, onSeatAt, toast }) {
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [dropActive, setDropActive] = useState(false);

  const tableIndex = useMemo(() => new Map(data.tables.map((t, i) => [t.id, tableName(t, i)])), [data.tables]);

  const counts = useMemo(() => {
    const c = { total: data.guests.length, seated: 0, confirmed: 0, pending: 0, declined: 0, invited: 0 };
    data.guests.forEach((g) => {
      if (g.tableId) c.seated += 1;
      if (g.invited) c.invited += 1;
      c[g.rsvp] += 1;
    });
    return c;
  }, [data.guests]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.guests.filter((g) => {
      if (q && !`${g.name} ${g.group} ${g.email}`.toLowerCase().includes(q)) return false;
      if (filter === 'seated') return Boolean(g.tableId);
      if (filter === 'unseated') return !g.tableId;
      if (['confirmed', 'pending', 'declined'].includes(filter)) return g.rsvp === filter;
      return true;
    });
  }, [data.guests, query, filter]);

  const addOne = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    dispatch({ type: 'guest/add', guests: [createGuest(name)] });
    setName('');
  };

  const addPasted = () => {
    const guests = parsePastedNames(pasteText);
    if (!guests.length) return toast('Paste at least one name, one per line.', 'error');
    dispatch({ type: 'guest/add', guests });
    toast(`Added ${guests.length} guest${guests.length === 1 ? '' : 's'}.`, 'success');
    setPasteText('');
    setPasteOpen(false);
  };

  const pick = (id) => setPendingGuestId((cur) => (cur === id ? null : id));

  return (
    <div
      className={`panel-scroll guest-panel${dropActive ? ' is-drop-target' : ''}`}
      onDragOver={(e) => {
        if (readOnly || !hasGuestData(e)) return;
        e.preventDefault();
        setDropActive(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setDropActive(false);
      }}
      onDrop={(e) => {
        setDropActive(false);
        const id = e.dataTransfer.getData(GUEST_MIME);
        if (id) {
          e.preventDefault();
          dispatch({ type: 'guest/unseat', id });
        }
      }}
    >
      <section className="panel-section guest-summary" aria-label="Guest summary">
        <div><strong>{counts.total}</strong><span>guests</span></div>
        <div><strong>{counts.seated}</strong><span>seated</span></div>
        <div className="tone-confirmed"><strong>{counts.confirmed}</strong><span>confirmed</span></div>
        <div className="tone-pending"><strong>{counts.pending}</strong><span>pending</span></div>
        <div className="tone-declined"><strong>{counts.declined}</strong><span>declined</span></div>
      </section>

      {!readOnly && (
        <section className="panel-section">
          <form className="add-guest" onSubmit={addOne}>
            <label className="sr-only" htmlFor="new-guest">Guest name</label>
            <input id="new-guest" className="input" placeholder="Add a guest name…" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            <button type="submit" className="btn btn-primary" disabled={!name.trim()}>Add</button>
          </form>
          <div className="row gap-sm mt-sm">
            <button type="button" className="btn btn-sm" aria-expanded={pasteOpen} onClick={() => setPasteOpen((o) => !o)}>Paste a list</button>
            <button type="button" className="btn btn-sm" onClick={onImport}>Import Excel / CSV</button>
          </div>
          {pasteOpen && (
            <div className="paste-box">
              <label className="field">
                <span>One guest per line (optionally “Name, Group”)</span>
                <textarea className="input" rows={6} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={'Ava Thompson, Bride’s family\nNoah Patel\nMia Chen, College friends'} />
              </label>
              <button type="button" className="btn btn-primary btn-sm" onClick={addPasted}>Add {parsePastedNames(pasteText).length || ''} guests</button>
            </div>
          )}
        </section>
      )}

      {pendingGuestId && (
        <div className="pick-banner" role="status">
          Tap a seat on the canvas to place <strong>{data.guests.find((g) => g.id === pendingGuestId)?.name}</strong>
          <button type="button" className="btn btn-sm" onClick={() => setPendingGuestId(null)}>Cancel</button>
        </div>
      )}

      <section className="panel-section guest-list-section">
        <div className="guest-filters">
          <input className="input input-sm" type="search" placeholder="Search guests" aria-label="Search guests" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="select select-sm" aria-label="Filter guests" value={filter} onChange={(e) => setFilter(e.target.value)}>
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
        {data.guests.length === 0 ? (
          <p className="empty-note">No guests yet. Add names above, paste a list, or import a spreadsheet — then drag them onto seats.</p>
        ) : visible.length === 0 ? (
          <p className="empty-note">No guests match.</p>
        ) : (
          <ul className="guest-list">
            {visible.map((g) => (
              <GuestRow
                key={g.id}
                guest={g}
                tables={data.tables}
                tableLabel={g.tableId ? tableIndex.get(g.tableId) : null}
                readOnly={readOnly}
                isPending={pendingGuestId === g.id}
                expanded={expandedId === g.id}
                onToggleExpand={() => setExpandedId((cur) => (cur === g.id ? null : g.id))}
                onPick={pick}
                onSeatAt={onSeatAt}
                dispatch={dispatch}
              />
            ))}
          </ul>
        )}
        {!readOnly && data.guests.length > 0 && <p className="muted small mt-sm">Drag a guest onto a seat, or click a name then tap a seat. Drop a seated guest here to unseat them.</p>}
      </section>
    </div>
  );
}
