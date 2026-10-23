import { forwardRef, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import { WORLD, FIXTURES, SEAT_SIZE, contentBounds, tableGeometry, tableName } from '../../lib/model.js';

export const GUEST_MIME = 'application/x-seatcraft-guest';
const SNAP = 10;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

export const hasGuestData = (e) => Array.from(e.dataTransfer?.types ?? []).includes(GUEST_MIME);

/** Pointer-driven move for tables and fixtures. A history checkpoint is taken once per drag. */
function useItemDrag({ item, kind, zoom, dispatch, onSelect, readOnly, snap }) {
  return useCallback(
    (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.stopPropagation();
      onSelect({ kind, id: item.id });
      if (readOnly) return;
      const el = e.currentTarget;
      el.setPointerCapture?.(e.pointerId);
      const start = { px: e.clientX, py: e.clientY, x: item.x, y: item.y };
      let moved = false;
      const move = (ev) => {
        const dx = (ev.clientX - start.px) / zoom;
        const dy = (ev.clientY - start.py) / zoom;
        if (!moved && Math.hypot(dx, dy) * zoom < 4) return;
        if (!moved) {
          moved = true;
          dispatch({ type: 'checkpoint' });
        }
        let x = start.x + dx;
        let y = start.y + dy;
        if (snap && !ev.altKey) {
          x = Math.round(x / SNAP) * SNAP;
          y = Math.round(y / SNAP) * SNAP;
        }
        dispatch({ type: 'item/move', kind, id: item.id, x: clamp(x, 0, WORLD.width), y: clamp(y, 0, WORLD.height), history: false });
      };
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    },
    [item.id, item.x, item.y, kind, zoom, dispatch, onSelect, readOnly, snap],
  );
}

function RotateHandle({ item, kind, dispatch, distance }) {
  const onPointerDown = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture?.(e.pointerId);
    const anchor = el.parentElement.getBoundingClientRect();
    const cx = anchor.left + anchor.width / 2;
    const cy = anchor.top + anchor.height / 2;
    dispatch({ type: 'checkpoint' });
    const move = (ev) => {
      let deg = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90;
      if (!ev.shiftKey) deg = Math.round(deg / 15) * 15;
      const rotation = ((Math.round(deg) % 360) + 360) % 360;
      dispatch({ type: kind === 'table' ? 'table/update' : 'fixture/update', id: item.id, patch: { rotation }, history: false });
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  return (
    <div className="rotate-handle no-export" style={{ top: -distance - 26 }} onPointerDown={onPointerDown} title="Drag to rotate (hold Shift for free rotation)" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

const TableNode = memo(function TableNode({ table, index, seated, selected, pendingGuestId, readOnly, zoom, snap, dispatch, onSelect, onSeatClick, onSeatDrop, onTableDrop }) {
  const geo = useMemo(() => tableGeometry(table), [table]);
  const innerRef = useRef(null);
  const onPointerDown = useItemDrag({ item: table, kind: 'table', zoom, dispatch, onSelect, readOnly, snap });
  const filled = seated.filter(Boolean).length;
  const name = tableName(table, index);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(innerRef.current, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.8)', delay: Math.min(index, 14) * 0.025, clearProps: 'transform,opacity' });
    });
    return () => ctx.revert();
    // Only animate on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allowDrop = (e) => {
    if (readOnly || !hasGuestData(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('is-drop-target');
  };
  const clearDrop = (e) => e.currentTarget.classList.remove('is-drop-target');

  return (
    <div
      className={`table-node shape-${table.shape}${selected ? ' is-selected' : ''}${filled >= table.seats ? ' is-full' : ''}`}
      style={{ left: table.x, top: table.y, transform: `rotate(${table.rotation}deg)` }}
    >
      <div ref={innerRef} className="table-inner">
        <div
          className="table-body"
          role="button"
          tabIndex={0}
          aria-pressed={selected}
          aria-label={`${name}, ${filled} of ${table.seats} seats filled`}
          style={{ width: geo.w, height: geo.h, left: -geo.w / 2, top: -geo.h / 2 }}
          onPointerDown={onPointerDown}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect({ kind: 'table', id: table.id });
            }
          }}
          onDragOver={allowDrop}
          onDragLeave={clearDrop}
          onDrop={(e) => {
            clearDrop(e);
            const id = e.dataTransfer.getData(GUEST_MIME);
            if (id) {
              e.preventDefault();
              onTableDrop(id, table.id);
            }
          }}
        >
          <span className="table-text" style={{ transform: `rotate(${-table.rotation}deg)` }}>
            <span className="table-name">{name}</span>
            <span className="table-count">
              {filled}/{table.seats}
            </span>
          </span>
        </div>
        {geo.seats.map((p, i) => {
          const guest = seated[i];
          const isPending = guest && guest.id === pendingGuestId;
          return (
            <button
              type="button"
              key={i}
              className={`seat${guest ? ` is-taken rsvp-${guest.rsvp}` : ''}${isPending ? ' is-pending' : ''}`}
              style={{ left: p.x - SEAT_SIZE / 2, top: p.y - SEAT_SIZE / 2, width: SEAT_SIZE, height: SEAT_SIZE }}
              aria-label={guest ? `${name}, seat ${i + 1}: ${guest.name}` : `${name}, seat ${i + 1}: empty`}
              title={guest ? `${guest.name}${guest.group ? ` · ${guest.group}` : ''}` : `Seat ${i + 1}`}
              draggable={Boolean(guest) && !readOnly}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onSeatClick(table.id, i, guest);
              }}
              onDragStart={(e) => {
                e.dataTransfer.setData(GUEST_MIME, guest.id);
                e.dataTransfer.setData('text/plain', guest.name);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={allowDrop}
              onDragLeave={clearDrop}
              onDrop={(e) => {
                clearDrop(e);
                const id = e.dataTransfer.getData(GUEST_MIME);
                if (id) {
                  e.preventDefault();
                  e.stopPropagation();
                  onSeatDrop(id, table.id, i);
                }
              }}
            >
              <span style={{ transform: `rotate(${-table.rotation}deg)` }}>{guest ? initials(guest.name) : ''}</span>
            </button>
          );
        })}
        {selected && !readOnly && <RotateHandle item={table} kind="table" dispatch={dispatch} distance={geo.extent} />}
      </div>
    </div>
  );
});

const FixtureNode = memo(function FixtureNode({ fixture, selected, readOnly, zoom, snap, dispatch, onSelect }) {
  const onPointerDown = useItemDrag({ item: fixture, kind: 'fixture', zoom, dispatch, onSelect, readOnly, snap });
  return (
    <div className={`fixture-node kind-${fixture.kind}${selected ? ' is-selected' : ''}`} style={{ left: fixture.x, top: fixture.y, transform: `rotate(${fixture.rotation}deg)` }}>
      <div
        className="fixture-body"
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={`${fixture.label || FIXTURES[fixture.kind].label}`}
        style={{ width: fixture.w, height: fixture.h, left: -fixture.w / 2, top: -fixture.h / 2 }}
        onPointerDown={onPointerDown}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect({ kind: 'fixture', id: fixture.id });
          }
        }}
      >
        <span style={{ transform: `rotate(${-fixture.rotation}deg)` }}>{fixture.label}</span>
      </div>
      {selected && !readOnly && <RotateHandle item={fixture} kind="fixture" dispatch={dispatch} distance={fixture.h / 2} />}
    </div>
  );
});

/**
 * The venue canvas: a fixed-size world, scaled by `zoom`, inside a scrollable viewport.
 * `worldRef` points at the world element so it can be exported as an image.
 */
const Canvas = forwardRef(function Canvas(
  { data, view, setView, fitSignal, selected, onSelect, pendingGuestId, readOnly, snap, dispatch, onSeatClick, onSeatDrop, onTableDrop, onEmptyAction },
  worldRef,
) {
  const viewportRef = useRef(null);
  const scrollTimer = useRef(null);
  const zoom = view.zoom;

  const seatedByTable = useMemo(() => {
    const map = new Map(data.tables.map((t) => [t.id, Array(t.seats).fill(null)]));
    data.guests.forEach((g) => {
      if (g.tableId && map.has(g.tableId)) map.get(g.tableId)[g.seat] = g;
    });
    return map;
  }, [data.tables, data.guests]);

  const fit = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const b = contentBounds(data, 80);
    const z = clamp(Math.min(vp.clientWidth / b.w, vp.clientHeight / b.h), 0.25, 1.2);
    const nextZoom = Math.round(z * 100) / 100;
    setView((v) => ({ ...v, zoom: nextZoom }));
    requestAnimationFrame(() => {
      vp.scrollLeft = b.x * nextZoom - (vp.clientWidth - b.w * nextZoom) / 2;
      vp.scrollTop = b.y * nextZoom - (vp.clientHeight - b.h * nextZoom) / 2;
    });
  }, [data, setView]);

  // Restore scroll position on first mount (zoom comes from the saved view).
  useLayoutEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    if (view.scrollLeft || view.scrollTop) {
      vp.scrollLeft = view.scrollLeft;
      vp.scrollTop = view.scrollTop;
    } else {
      fit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (fitSignal) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal]);

  const zoomTo = useCallback(
    (next, clientX, clientY) => {
      const vp = viewportRef.current;
      const z = Math.round(clamp(next, 0.25, 2.5) * 100) / 100;
      if (!vp || z === zoom) return;
      const rect = vp.getBoundingClientRect();
      const ax = (clientX ?? rect.left + rect.width / 2) - rect.left;
      const ay = (clientY ?? rect.top + rect.height / 2) - rect.top;
      const wx = (vp.scrollLeft + ax) / zoom;
      const wy = (vp.scrollTop + ay) / zoom;
      setView((v) => ({ ...v, zoom: z }));
      requestAnimationFrame(() => {
        vp.scrollLeft = wx * z - ax;
        vp.scrollTop = wy * z - ay;
      });
    },
    [zoom, setView],
  );

  // Ctrl/⌘ + wheel (and trackpad pinch) zooms around the pointer.
  useEffect(() => {
    const vp = viewportRef.current;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomTo(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX, e.clientY);
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [zoom, zoomTo]);

  const onScroll = () => {
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      const vp = viewportRef.current;
      if (vp) setView((v) => ({ ...v, scrollLeft: Math.round(vp.scrollLeft), scrollTop: Math.round(vp.scrollTop) }));
    }, 250);
  };

  // Mouse-drag on empty canvas pans; touch uses native scrolling.
  const onBackgroundPointerDown = (e) => {
    if (e.target !== e.currentTarget && !e.target.classList.contains('canvas-world') && !e.target.classList.contains('canvas-sizer')) return;
    onSelect(null);
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const vp = viewportRef.current;
    const start = { x: e.clientX, y: e.clientY, l: vp.scrollLeft, t: vp.scrollTop };
    vp.classList.add('is-panning');
    const move = (ev) => {
      vp.scrollLeft = start.l - (ev.clientX - start.x);
      vp.scrollTop = start.t - (ev.clientY - start.y);
    };
    const up = () => {
      vp.classList.remove('is-panning');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const isEmpty = !data.tables.length && !data.fixtures.length;

  return (
    <div className="canvas-wrap">
      <div ref={viewportRef} className="canvas-viewport" onScroll={onScroll} onPointerDown={onBackgroundPointerDown} aria-label="Floor plan canvas" role="region">
        <div className="canvas-sizer" style={{ width: WORLD.width * zoom, height: WORLD.height * zoom }}>
          <div ref={worldRef} className="canvas-world" style={{ width: WORLD.width, height: WORLD.height, transform: `scale(${zoom})` }}>
            {data.fixtures.map((f) => (
              <FixtureNode key={f.id} fixture={f} selected={selected?.id === f.id} readOnly={readOnly} zoom={zoom} snap={snap} dispatch={dispatch} onSelect={onSelect} />
            ))}
            {data.tables.map((t, i) => (
              <TableNode
                key={t.id}
                table={t}
                index={i}
                seated={seatedByTable.get(t.id)}
                selected={selected?.id === t.id}
                pendingGuestId={pendingGuestId}
                readOnly={readOnly}
                zoom={zoom}
                snap={snap}
                dispatch={dispatch}
                onSelect={onSelect}
                onSeatClick={onSeatClick}
                onSeatDrop={onSeatDrop}
                onTableDrop={onTableDrop}
              />
            ))}
          </div>
        </div>
      </div>

      {isEmpty && !readOnly && (
        <div className="canvas-empty">
          <h2>Start your floor plan</h2>
          <p>Pick a venue template, or add tables from the Layout panel and drag them into place.</p>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={() => onEmptyAction('templates')}>
              Choose a template
            </button>
            <button type="button" className="btn" onClick={() => onEmptyAction('round')}>
              Add a round table
            </button>
          </div>
        </div>
      )}

      <div className="zoom-controls" role="group" aria-label="Zoom">
        <button type="button" className="icon-btn" onClick={() => zoomTo(zoom / 1.2)} aria-label="Zoom out" title="Zoom out">
          −
        </button>
        <button type="button" className="zoom-value" onClick={() => zoomTo(1)} title="Reset to 100%" aria-label={`Zoom ${Math.round(zoom * 100)}%, reset to 100%`}>
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" className="icon-btn" onClick={() => zoomTo(zoom * 1.2)} aria-label="Zoom in" title="Zoom in">
          +
        </button>
        <button type="button" className="icon-btn" onClick={fit} aria-label="Fit layout to screen" title="Fit to screen">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
});

export default Canvas;
