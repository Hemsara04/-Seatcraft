import { FIXTURES, SHAPES, tableName } from '../../lib/model.js';

function Stepper({ value, min, max, onChange, label, disabled }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="icon-btn" disabled={disabled || value <= min} onClick={() => onChange(value - 1)} aria-label={`Decrease ${label}`}>−</button>
      <input
        className="input input-sm"
        type="number"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
      />
      <button type="button" className="icon-btn" disabled={disabled || value >= max} onClick={() => onChange(value + 1)} aria-label={`Increase ${label}`}>+</button>
    </div>
  );
}

function Rotation({ value, onChange, disabled }) {
  return (
    <div className="field">
      <span>Rotation · {value}°</span>
      <div className="row gap-sm">
        <button type="button" className="btn btn-sm" disabled={disabled} onClick={() => onChange(value - 15)} aria-label="Rotate 15° left">⟲ 15°</button>
        <input type="range" min="0" max="345" step="15" value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} aria-label="Rotation in degrees" className="range" />
        <button type="button" className="btn btn-sm" disabled={disabled} onClick={() => onChange(value + 15)} aria-label="Rotate 15° right">⟳ 15°</button>
      </div>
    </div>
  );
}

function EventDetails({ data, dispatch, readOnly }) {
  const update = (patch, key) => dispatch({ type: 'event/update', patch, coalesce: key });
  const capacity = data.tables.reduce((n, t) => n + t.seats, 0);
  const seated = data.guests.filter((g) => g.tableId).length;
  const attending = data.guests.filter((g) => g.rsvp !== 'declined').length;
  return (
    <div className="panel-scroll">
      <section className="panel-section">
        <div className="section-head"><h3>Event</h3></div>
        <label className="field"><span>Event name</span><input className="input" value={data.event.name} disabled={readOnly} maxLength={120} onChange={(e) => update({ name: e.target.value }, 'event-name')} /></label>
        <label className="field"><span>Date</span><input className="input" type="date" value={data.event.date} disabled={readOnly} onChange={(e) => update({ date: e.target.value }, 'event-date')} /></label>
        <label className="field"><span>Venue</span><input className="input" value={data.event.venue} disabled={readOnly} maxLength={120} placeholder="e.g. The Orangery" onChange={(e) => update({ venue: e.target.value }, 'event-venue')} /></label>
      </section>
      <section className="panel-section">
        <div className="section-head"><h3>At a glance</h3></div>
        <dl className="glance">
          <div><dt>Tables</dt><dd>{data.tables.length}</dd></div>
          <div><dt>Seats</dt><dd>{capacity}</dd></div>
          <div><dt>Guests</dt><dd>{data.guests.length}</dd></div>
          <div><dt>Seated</dt><dd>{seated}</dd></div>
          <div><dt>Expected</dt><dd>{attending}</dd></div>
          <div><dt>Free seats</dt><dd className={capacity - seated < 0 ? 'warn' : ''}>{capacity - seated}</dd></div>
        </dl>
        {attending > capacity && <p className="callout callout-warn">You have {attending - capacity} more expected guests than seats.</p>}
      </section>
      <p className="muted small panel-section">Select a table or room feature on the canvas to edit it.</p>
    </div>
  );
}

export default function DetailsPanel({ data, selected, dispatch, readOnly, onDuplicate, onDelete, toast }) {
  const tableIdx = selected?.kind === 'table' ? data.tables.findIndex((t) => t.id === selected.id) : -1;
  const table = data.tables[tableIdx];
  const fixture = selected?.kind === 'fixture' ? data.fixtures.find((f) => f.id === selected.id) : null;

  if (table) {
    const spec = SHAPES[table.shape];
    const update = (patch, key) => dispatch({ type: 'table/update', id: table.id, patch, coalesce: key });
    const seated = data.guests.filter((g) => g.tableId === table.id).sort((a, b) => a.seat - b.seat);
    const name = tableName(table, tableIdx);
    return (
      <div className="panel-scroll">
        <section className="panel-section">
          <div className="section-head">
            <h3>{name}</h3>
            <span className={`badge${seated.length >= table.seats ? ' badge-full' : ''}`}>{seated.length}/{table.seats}</span>
          </div>
          <label className="field"><span>Name or number</span><input className="input" value={table.label} placeholder={`Table ${tableIdx + 1}`} disabled={readOnly} maxLength={60} onChange={(e) => update({ label: e.target.value }, `label-${table.id}`)} /></label>
          <div className="field">
            <span>Shape</span>
            <div className="segmented" role="radiogroup" aria-label="Table shape">
              {Object.entries(SHAPES).map(([key, s]) => (
                <button key={key} type="button" role="radio" aria-checked={table.shape === key} className={table.shape === key ? 'is-active' : ''} disabled={readOnly} onClick={() => update({ shape: key })}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Seats</span>
            <Stepper value={table.seats} min={spec.min} max={spec.max} label="seats" disabled={readOnly} onChange={(seats) => {
              const lost = seated.filter((g) => g.seat >= seats).length;
              update({ seats }, `seats-${table.id}`);
              if (lost) toast(`${lost} guest${lost > 1 ? 's were' : ' was'} unseated.`, 'info');
            }} />
          </div>
          {table.shape === 'rect' && (
            <label className="switch">
              <input type="checkbox" checked={table.sides === 1} disabled={readOnly} onChange={(e) => update({ sides: e.target.checked ? 1 : 2 })} />
              <span>Seats on one side only (head table)</span>
            </label>
          )}
          <Rotation value={table.rotation} disabled={readOnly} onChange={(rotation) => update({ rotation }, `rot-${table.id}`)} />
          {!readOnly && (
            <div className="row gap-sm wrap">
              <button type="button" className="btn btn-sm" onClick={() => onDuplicate(table.id)}>Duplicate</button>
              <button type="button" className="btn btn-sm" disabled={!seated.length} onClick={() => dispatch({ type: 'table/clearSeats', id: table.id })}>Clear seats</button>
              <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => onDelete({ kind: 'table', id: table.id })}>Delete table</button>
            </div>
          )}
        </section>
        <section className="panel-section">
          <div className="section-head"><h3>Seated here</h3></div>
          {seated.length ? (
            <ol className="seated-list">
              {seated.map((g) => (
                <li key={g.id} className={`rsvp-${g.rsvp}`}>
                  <span className="seat-no">{g.seat + 1}</span>
                  <span className="grow">{g.name}{g.rsvp === 'declined' && <em className="muted"> · declined</em>}</span>
                  {!readOnly && <button type="button" className="icon-btn" aria-label={`Unseat ${g.name}`} onClick={() => dispatch({ type: 'guest/unseat', id: g.id })}>×</button>}
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-note">Drag guests from the Guests panel onto this table’s seats.</p>
          )}
        </section>
      </div>
    );
  }

  if (fixture) {
    const update = (patch, key) => dispatch({ type: 'fixture/update', id: fixture.id, patch, coalesce: key });
    return (
      <div className="panel-scroll">
        <section className="panel-section">
          <div className="section-head"><h3>{FIXTURES[fixture.kind].label}</h3></div>
          <label className="field"><span>Label</span><input className="input" value={fixture.label} disabled={readOnly} maxLength={60} onChange={(e) => update({ label: e.target.value }, `flabel-${fixture.id}`)} /></label>
          <div className="row gap-sm">
            <label className="field grow"><span>Width</span><input className="input" type="number" min="20" max="1200" step="10" value={fixture.w} disabled={readOnly} onChange={(e) => update({ w: Math.min(1200, Math.max(20, Number(e.target.value) || 20)) }, `fw-${fixture.id}`)} /></label>
            <label className="field grow"><span>Depth</span><input className="input" type="number" min="20" max="1200" step="10" value={fixture.h} disabled={readOnly} onChange={(e) => update({ h: Math.min(1200, Math.max(20, Number(e.target.value) || 20)) }, `fh-${fixture.id}`)} /></label>
          </div>
          <Rotation value={fixture.rotation} disabled={readOnly} onChange={(r) => update({ rotation: ((r % 360) + 360) % 360 }, `frot-${fixture.id}`)} />
          {!readOnly && (
            <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => onDelete({ kind: 'fixture', id: fixture.id })}>Remove</button>
          )}
        </section>
      </div>
    );
  }

  return <EventDetails data={data} dispatch={dispatch} readOnly={readOnly} />;
}
