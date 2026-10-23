import { useEffect, useMemo, useState } from 'react';
import { Modal } from './ui.jsx';
import { safeFileName, createShareLink, copyToClipboard, SHARE_LINK_WARN_LENGTH } from '../../lib/layoutStorage.js';
import { MAX_COLLABORATORS, tableGeometry, tableName } from '../../lib/model.js';
import { TEMPLATES } from '../../lib/templates.js';
import { GUEST_FIELDS, guessMapping, readSpreadsheet, rowsToGuests } from '../../lib/importGuests.js';

/* ---------------------------------------------------------------- Save to file */

export function SaveFileDialog({ open, onClose, defaultName, onSave }) {
  const [name, setName] = useState(defaultName);
  useEffect(() => {
    if (open) setName(defaultName);
  }, [open, defaultName]);
  const submit = (e) => {
    e.preventDefault();
    onSave(name);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Save layout to file"
      size="sm"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" form="save-form" className="btn btn-primary">Download .json</button>
        </>
      }
    >
      <form id="save-form" onSubmit={submit}>
        <label className="field">
          <span>File name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} />
        </label>
        <p className="muted small">
          Saves as <code>{safeFileName(name)}-layout.json</code>. Open it later with <strong>Open file</strong> to keep editing.
        </p>
      </form>
    </Modal>
  );
}

/* ---------------------------------------------------------------- Share link */

export function ShareDialog({ open, onClose, data, onSaveFile, toast }) {
  const [copied, setCopied] = useState(false);
  const share = useMemo(() => {
    if (!open) return null;
    try {
      return createShareLink(data);
    } catch (err) {
      return { error: err.message };
    }
  }, [open, data]);

  useEffect(() => setCopied(false), [open]);

  const copy = async () => {
    const ok = await copyToClipboard(share.url);
    if (ok) {
      setCopied(true);
      toast('Share link copied to clipboard.', 'success');
    } else {
      toast('Couldn’t access the clipboard — select the link and copy it manually.', 'error');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Share a link" size="md">
      {share?.error ? (
        <p className="callout callout-error">{share.error}</p>
      ) : share ? (
        <div className="stack">
          <p className="muted">
            Anyone with this link can open your plan in their browser — no account needed. It opens <strong>read-only</strong>, with an option to make their own editable copy.
            The whole plan lives inside the link, so nothing is uploaded to a server.
          </p>
          {share.tooLong && (
            <div className="callout callout-warn" role="alert">
              <strong>This link is very long ({share.length.toLocaleString()} characters).</strong> Some apps and browsers cut off links over about {SHARE_LINK_WARN_LENGTH.toLocaleString()} characters.
              For large plans, saving to a file and sending that is more reliable.
              <div className="row gap-sm mt-sm">
                <button type="button" className="btn btn-sm btn-primary" onClick={onSaveFile}>Save to file instead</button>
              </div>
            </div>
          )}
          <label className="field">
            <span>Link · {share.length.toLocaleString()} characters</span>
            <input className="input mono" readOnly value={share.url} onFocus={(e) => e.target.select()} />
          </label>
          <div className="row gap-sm">
            <button type="button" className="btn btn-primary" onClick={copy}>{copied ? 'Copied ✓' : share.tooLong ? 'Copy anyway' : 'Copy share link'}</button>
          </div>
          <p className="muted small">The link is a snapshot. After making changes, copy a new link to share the latest version.</p>
        </div>
      ) : null}
    </Modal>
  );
}

/* ---------------------------------------------------------------- Collaborators */

export function CollaboratorsDialog({ open, onClose, data, dispatch, readOnly, toast }) {
  const [form, setForm] = useState({ name: '', email: '', role: 'editor' });
  const list = data.collaborators;
  const full = list.length >= MAX_COLLABORATORS;

  const add = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) return toast('That email address doesn’t look right.', 'error');
    dispatch({ type: 'collab/add', collaborator: { name: form.name.trim().slice(0, 80), email: form.email.trim().slice(0, 120), role: form.role } });
    setForm({ name: '', email: '', role: 'editor' });
  };

  const copyInvite = async (c) => {
    try {
      const { url, tooLong } = createShareLink(data);
      const ok = await copyToClipboard(`${url}&invite=${encodeURIComponent(c.id)}&role=${c.role}&to=${encodeURIComponent(c.name)}`);
      toast(ok ? `Invite link for ${c.name} copied.${tooLong ? ' It’s long — consider sending the file instead.' : ''}` : 'Couldn’t copy the link.', ok ? 'success' : 'error');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Collaborators" size="md">
      <div className="stack">
        <p className="muted">
          Add up to {MAX_COLLABORATORS} people — partner, planner, venue or caterer. Each gets a personal invite link: <strong>editors</strong> can open an editable copy of the seating chart and guest list, <strong>viewers</strong> see it read-only.
        </p>
        <ul className="collab-list">
          {list.length === 0 && <li className="empty-note">No collaborators yet.</li>}
          {list.map((c) => (
            <li key={c.id}>
              <span className="avatar" aria-hidden="true">{c.name.slice(0, 1).toUpperCase()}</span>
              <span className="grow">
                <strong>{c.name}</strong>
                <small className="muted">{c.email || 'No email'}</small>
              </span>
              <select className="select select-sm" value={c.role} disabled={readOnly} aria-label={`Access for ${c.name}`} onChange={(e) => dispatch({ type: 'collab/update', id: c.id, patch: { role: e.target.value } })}>
                <option value="editor">Can edit</option>
                <option value="viewer">Can view</option>
              </select>
              <button type="button" className="btn btn-sm" onClick={() => copyInvite(c)}>Copy invite</button>
              {!readOnly && <button type="button" className="icon-btn" aria-label={`Remove ${c.name}`} onClick={() => dispatch({ type: 'collab/remove', id: c.id })}>×</button>}
            </li>
          ))}
        </ul>
        {!readOnly && (
          <form className="collab-form" onSubmit={add}>
            <input className="input" placeholder="Name" aria-label="Collaborator name" value={form.name} disabled={full} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="input" type="email" placeholder="Email (optional)" aria-label="Collaborator email" value={form.email} disabled={full} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <select className="select" aria-label="Access level" value={form.role} disabled={full} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="editor">Can edit</option>
              <option value="viewer">Can view</option>
            </select>
            <button type="submit" className="btn btn-primary" disabled={full || !form.name.trim()}>Add</button>
          </form>
        )}
        <p className="muted small">
          {list.length}/{MAX_COLLABORATORS} collaborators. Open tabs on this device update live. Everything stays in your browser, so to share later changes with others, send a fresh invite link or the layout file.
        </p>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- Templates */

function TemplatePreview({ template }) {
  const { tables, fixtures } = useMemo(() => template.build(), [template]);
  return (
    <svg viewBox="200 100 1700 1300" className="template-preview" aria-hidden="true">
      {fixtures.map((f) => (
        <rect key={f.id} x={f.x - f.w / 2} y={f.y - f.h / 2} width={f.w} height={f.h} rx="8" className={`tp-fixture kind-${f.kind}`} />
      ))}
      {tables.map((t) => {
        const g = tableGeometry(t);
        return (
          <g key={t.id} transform={`translate(${t.x} ${t.y}) rotate(${t.rotation})`}>
            {t.shape === 'round' ? <circle r={g.w / 2} className="tp-table" /> : <rect x={-g.w / 2} y={-g.h / 2} width={g.w} height={g.h} rx="6" className="tp-table" />}
            {g.seats.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r="13" className="tp-seat" />)}
          </g>
        );
      })}
    </svg>
  );
}

export function TemplatesDialog({ open, onClose, onApply }) {
  return (
    <Modal open={open} onClose={onClose} title="Start from a venue template" size="lg">
      <p className="muted">Templates replace the room layout. Your event details and guest list are kept (guests are unseated).</p>
      <div className="template-grid">
        {TEMPLATES.map((t) => (
          <button key={t.id} type="button" className="template-card" onClick={() => onApply(t.id)}>
            <TemplatePreview template={t} />
            <strong>{t.name}</strong>
            <small className="muted">{t.description}</small>
          </button>
        ))}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- Excel / CSV import */

export function ImportDialog({ open, onClose, initialFile, data, onImport }) {
  const [sheet, setSheet] = useState(null);
  const [mapping, setMapping] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async (file) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const parsed = await readSpreadsheet(file);
      setSheet({ ...parsed, fileName: file.name });
      setMapping(guessMapping(parsed.headers));
    } catch (err) {
      setSheet(null);
      setError(err.message || 'That file could not be read.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setSheet(null);
      setError('');
      return;
    }
    if (initialFile) load(initialFile);
  }, [open, initialFile]);

  const tableIdFor = useMemo(() => {
    const lookup = new Map();
    data.tables.forEach((t, i) => {
      lookup.set(tableName(t, i).toLowerCase(), t.id);
      lookup.set(String(i + 1), t.id);
      if (t.label) lookup.set(t.label.trim().toLowerCase(), t.id);
    });
    return (value) => lookup.get(String(value).trim().toLowerCase()) ?? null;
  }, [data.tables]);

  const result = useMemo(() => (sheet ? rowsToGuests(sheet.rows, mapping, tableIdFor) : []), [sheet, mapping, tableIdFor]);
  const hasName = mapping.name !== undefined || mapping.firstName !== undefined;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import guests from Excel or CSV"
      size="lg"
      footer={
        sheet && (
          <>
            <button type="button" className="btn" onClick={() => setSheet(null)}>Choose another file</button>
            <button type="button" className="btn btn-primary" disabled={!hasName || !result.length} onClick={() => onImport(result)}>
              Import {result.length} guest{result.length === 1 ? '' : 's'}
            </button>
          </>
        )
      }
    >
      {!sheet ? (
        <div className="stack">
          <label className="dropzone">
            <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.ods,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={(e) => load(e.target.files?.[0])} />
            <strong>{busy ? 'Reading…' : 'Choose a spreadsheet'}</strong>
            <span className="muted">.xlsx, .xls, .ods or .csv — first sheet, one guest per row</span>
          </label>
          {error && <p className="callout callout-error" role="alert">{error}</p>}
          <p className="muted small">Tip: include columns like Name, Group, Email, RSVP, Table and Meal. You’ll match them to guest fields next.</p>
        </div>
      ) : (
        <div className="stack">
          <p className="muted">
            <strong>{sheet.fileName}</strong> · {sheet.rows.length} rows. Match your columns to guest fields:
          </p>
          <div className="mapping-grid">
            {GUEST_FIELDS.map((f) => (
              <label key={f.key} className="field">
                <span>{f.label}</span>
                <select
                  className="select select-sm"
                  value={mapping[f.key] ?? ''}
                  onChange={(e) => setMapping((m) => {
                    const next = { ...m };
                    if (e.target.value === '') delete next[f.key];
                    else next[f.key] = Number(e.target.value);
                    return next;
                  })}
                >
                  <option value="">— Skip —</option>
                  {sheet.headers.map((h, i) => (
                    <option key={i} value={i}>{h}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {!hasName && <p className="callout callout-warn">Map a <strong>Full name</strong> or <strong>First name</strong> column to continue.</p>}
          {result.length > 0 && (
            <div className="preview-table-wrap">
              <table className="preview-table">
                <caption className="sr-only">Preview of the first guests</caption>
                <thead>
                  <tr><th>Name</th><th>Group</th><th>RSVP</th><th>Table</th><th>Meal</th></tr>
                </thead>
                <tbody>
                  {result.slice(0, 6).map(({ guest, tableId }) => (
                    <tr key={guest.id}>
                      <td>{guest.name}</td>
                      <td>{guest.group}</td>
                      <td>{guest.rsvp}</td>
                      <td>{tableId ? tableName(data.tables.find((t) => t.id === tableId), data.tables.findIndex((t) => t.id === tableId)) : '—'}</td>
                      <td>{guest.meal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.length > 6 && <p className="muted small">…and {result.length - 6} more</p>}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
