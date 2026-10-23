import { SHAPES, MAX_COLLABORATORS, uid } from './model.js';

const HISTORY_LIMIT = 100;
const COALESCE_MS = 800;

export function initHistory(present) {
  return { past: [], present, future: [], lastKey: null, lastAt: 0 };
}

/**
 * Wraps the layout reducer with undo/redo.
 * - action.history === false: change present without recording a step (live dragging, remote sync).
 * - action.coalesce: consecutive actions with the same key within a short window share one step (typing).
 */
export function historyReducer(state, action) {
  switch (action.type) {
    case 'undo': {
      if (!state.past.length) return state;
      const previous = state.past[state.past.length - 1];
      return { ...state, past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future], lastKey: null };
    }
    case 'redo': {
      if (!state.future.length) return state;
      const [next, ...rest] = state.future;
      return { ...state, past: [...state.past, state.present], present: next, future: rest, lastKey: null };
    }
    case 'checkpoint':
      return { ...state, past: [...state.past, state.present].slice(-HISTORY_LIMIT), future: [], lastKey: null };
    case 'reset':
      return initHistory(action.data);
    default: {
      const next = planReducer(state.present, action);
      if (next === state.present) return state;
      if (action.history === false) return { ...state, present: next };
      const now = Date.now();
      if (action.coalesce && action.coalesce === state.lastKey && now - state.lastAt < COALESCE_MS) {
        return { ...state, present: next, lastAt: now };
      }
      return {
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: next,
        future: [],
        lastKey: action.coalesce ?? null,
        lastAt: now,
      };
    }
  }
}

const updateById = (list, id, fn) => list.map((item) => (item.id === id ? fn(item) : item));

export function firstFreeSeat(data, tableId) {
  const table = data.tables.find((t) => t.id === tableId);
  if (!table) return -1;
  const taken = new Set(data.guests.filter((g) => g.tableId === tableId).map((g) => g.seat));
  for (let i = 0; i < table.seats; i += 1) if (!taken.has(i)) return i;
  return -1;
}

export function planReducer(data, action) {
  switch (action.type) {
    case 'event/update':
      return { ...data, event: { ...data.event, ...action.patch } };

    case 'replace':
      return action.data;

    case 'table/add':
      return { ...data, tables: [...data.tables, ...[].concat(action.table)] };

    case 'table/update': {
      const tables = updateById(data.tables, action.id, (t) => {
        const next = { ...t, ...action.patch };
        const spec = SHAPES[next.shape];
        next.seats = Math.min(spec.max, Math.max(spec.min, Math.round(next.seats) || spec.min));
        next.rotation = ((Math.round(next.rotation) % 360) + 360) % 360;
        return next;
      });
      const table = tables.find((t) => t.id === action.id);
      if (!table) return data;
      // Shrinking a table unseats anyone who no longer has a chair.
      const guests = data.guests.map((g) =>
        g.tableId === table.id && g.seat >= table.seats ? { ...g, tableId: null, seat: null } : g,
      );
      return { ...data, tables, guests };
    }

    case 'table/remove':
      return {
        ...data,
        tables: data.tables.filter((t) => t.id !== action.id),
        guests: data.guests.map((g) => (g.tableId === action.id ? { ...g, tableId: null, seat: null } : g)),
      };

    case 'fixture/add':
      return { ...data, fixtures: [...data.fixtures, action.fixture] };

    case 'fixture/update':
      return { ...data, fixtures: updateById(data.fixtures, action.id, (f) => ({ ...f, ...action.patch })) };

    case 'fixture/remove':
      return { ...data, fixtures: data.fixtures.filter((f) => f.id !== action.id) };

    case 'item/move': {
      const key = action.kind === 'fixture' ? 'fixtures' : 'tables';
      return { ...data, [key]: updateById(data[key], action.id, (it) => ({ ...it, x: action.x, y: action.y })) };
    }

    case 'guest/add':
      return { ...data, guests: [...data.guests, ...action.guests] };

    case 'guest/update':
      return { ...data, guests: updateById(data.guests, action.id, (g) => ({ ...g, ...action.patch })) };

    case 'guest/remove':
      return { ...data, guests: data.guests.filter((g) => g.id !== action.id) };

    case 'guest/unseat':
      return { ...data, guests: updateById(data.guests, action.id, (g) => ({ ...g, tableId: null, seat: null })) };

    case 'guest/seat': {
      const guest = data.guests.find((g) => g.id === action.guestId);
      const table = data.tables.find((t) => t.id === action.tableId);
      if (!guest || !table) return data;
      const seat = action.seat ?? firstFreeSeat(data, table.id);
      if (seat < 0 || seat >= table.seats) return data;
      if (guest.tableId === table.id && guest.seat === seat) return data;
      const occupant = data.guests.find((g) => g.tableId === table.id && g.seat === seat && g.id !== guest.id);
      return {
        ...data,
        guests: data.guests.map((g) => {
          if (g.id === guest.id) return { ...g, tableId: table.id, seat };
          // Swap: the person in the target seat takes the mover's old seat (or becomes unseated).
          if (occupant && g.id === occupant.id) return { ...g, tableId: guest.tableId, seat: guest.seat };
          return g;
        }),
      };
    }

    case 'table/clearSeats':
      return {
        ...data,
        guests: data.guests.map((g) => (g.tableId === action.id ? { ...g, tableId: null, seat: null } : g)),
      };

    case 'collab/add':
      if (data.collaborators.length >= MAX_COLLABORATORS) return data;
      return {
        ...data,
        collaborators: [...data.collaborators, { id: uid('c'), addedAt: new Date().toISOString(), role: 'editor', ...action.collaborator }],
      };

    case 'collab/update':
      return { ...data, collaborators: updateById(data.collaborators, action.id, (c) => ({ ...c, ...action.patch })) };

    case 'collab/remove':
      return { ...data, collaborators: data.collaborators.filter((c) => c.id !== action.id) };

    default:
      return data;
  }
}
