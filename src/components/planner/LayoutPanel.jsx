import { FIXTURES, SHAPES } from '../../lib/model.js';

export const PALETTE_MIME = 'application/x-seatcraft-item';

const TABLE_PRESETS = [
  { shape: 'round', seats: 8, label: 'Round', hint: '8 seats' },
  { shape: 'round', seats: 10, label: 'Round', hint: '10 seats' },
  { shape: 'rect', seats: 8, label: 'Rectangle', hint: '8 seats' },
  { shape: 'rect', seats: 12, label: 'Banquet', hint: '12 seats' },
  { shape: 'square', seats: 4, label: 'Square', hint: '4 seats' },
  { shape: 'square', seats: 8, label: 'Square', hint: '8 seats' },
];

function ShapeIcon({ shape }) {
  if (shape === 'round') return <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="10" /><g className="dots">{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <circle key={i} cx={20 + Math.cos((i / 8) * Math.PI * 2) * 16} cy={20 + Math.sin((i / 8) * Math.PI * 2) * 16} r="2.6" />)}</g></svg>;
  if (shape === 'rect') return <svg viewBox="0 0 40 40" aria-hidden="true"><rect x="6" y="14" width="28" height="12" rx="2" /><g className="dots">{[10, 20, 30].flatMap((x) => [<circle key={`t${x}`} cx={x} cy="9" r="2.6" />, <circle key={`b${x}`} cx={x} cy="31" r="2.6" />])}</g></svg>;
  return <svg viewBox="0 0 40 40" aria-hidden="true"><rect x="11" y="11" width="18" height="18" rx="2" /><g className="dots"><circle cx="20" cy="5.5" r="2.6" /><circle cx="20" cy="34.5" r="2.6" /><circle cx="5.5" cy="20" r="2.6" /><circle cx="34.5" cy="20" r="2.6" /></g></svg>;
}

export default function LayoutPanel({ onAddTable, onAddFixture, onOpenTemplates, snap, setSnap, readOnly, stats }) {
  const dragProps = (payload) => ({
    draggable: !readOnly,
    onDragStart: (e) => {
      e.dataTransfer.setData(PALETTE_MIME, JSON.stringify(payload));
      e.dataTransfer.setData('text/plain', payload.label ?? payload.kind);
      e.dataTransfer.effectAllowed = 'copy';
    },
  });

  return (
    <div className="panel-scroll">
      <section className="panel-section">
        <div className="section-head">
          <h3>Venue template</h3>
        </div>
        <button type="button" className="btn btn-block" onClick={onOpenTemplates} disabled={readOnly}>
          Browse templates
        </button>
      </section>

      <section className="panel-section">
        <div className="section-head">
          <h3>Tables</h3>
          <span className="muted small">Drag onto the canvas or tap to add</span>
        </div>
        <div className="palette">
          {TABLE_PRESETS.map((p) => (
            <button
              key={`${p.shape}-${p.seats}`}
              type="button"
              className="palette-item"
              disabled={readOnly}
              onClick={() => onAddTable(p)}
              aria-label={`Add ${SHAPES[p.shape].label.toLowerCase()} table with ${p.seats} seats`}
              {...dragProps({ type: 'table', shape: p.shape, seats: p.seats, label: p.label })}
            >
              <ShapeIcon shape={p.shape} />
              <span>{p.label}</span>
              <small>{p.hint}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="panel-section">
        <div className="section-head">
          <h3>Room features</h3>
        </div>
        <div className="chip-grid">
          {Object.entries(FIXTURES).map(([kind, spec]) => (
            <button key={kind} type="button" className={`chip fixture-chip kind-${kind}`} disabled={readOnly} onClick={() => onAddFixture(kind)} {...dragProps({ type: 'fixture', kind })}>
              <i aria-hidden="true" />
              {spec.label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel-section">
        <label className="switch">
          <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
          <span>Snap to grid</span>
          <small className="muted">hold Alt to move freely</small>
        </label>
      </section>

      <section className="panel-section stats">
        <div><strong>{stats.tables}</strong><span>tables</span></div>
        <div><strong>{stats.capacity}</strong><span>seats</span></div>
        <div><strong>{stats.seated}</strong><span>seated</span></div>
      </section>

      <section className="panel-section tips muted small">
        <p><strong>Tips:</strong> drag empty space to pan · Ctrl/⌘ + scroll to zoom · select a table and press R to rotate, Delete to remove, arrow keys to nudge.</p>
      </section>
    </div>
  );
}
