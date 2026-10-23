// Domain model: shapes, factories, geometry and validation for a seating layout.

export const APP_NAME = 'Seatcraft';
export const WORLD = { width: 2400, height: 1600 };
export const MAX_COLLABORATORS = 10;
export const SEAT_SIZE = 30;

export const SHAPES = {
  round: { label: 'Round', min: 2, max: 16, seats: 8 },
  rect: { label: 'Rectangular', min: 1, max: 24, seats: 8 },
  square: { label: 'Square', min: 4, max: 16, seats: 8 },
};

export const FIXTURES = {
  dancefloor: { label: 'Dance floor', w: 260, h: 260 },
  stage: { label: 'Stage', w: 320, h: 120 },
  bar: { label: 'Bar', w: 220, h: 60 },
  buffet: { label: 'Buffet', w: 240, h: 60 },
  dj: { label: 'DJ booth', w: 130, h: 70 },
  cake: { label: 'Cake', w: 90, h: 90 },
  entrance: { label: 'Entrance', w: 140, h: 34 },
};

export const RSVP_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'declined', label: 'Declined' },
];

let counter = 0;
export function uid(prefix = 'id') {
  counter = (counter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${counter.toString(36)}`;
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function createDefaultData() {
  return {
    event: { name: 'Our Celebration', date: '', venue: '' },
    tables: [],
    fixtures: [],
    guests: [],
    collaborators: [],
  };
}

export function createTable({ shape = 'round', x = 600, y = 400, seats, label = '', rotation = 0, sides = 2 } = {}) {
  const spec = SHAPES[shape] ?? SHAPES.round;
  return {
    id: uid('t'),
    shape: SHAPES[shape] ? shape : 'round',
    label,
    x,
    y,
    rotation,
    seats: clamp(Math.round(seats ?? spec.seats), spec.min, spec.max),
    sides: sides === 1 ? 1 : 2,
  };
}

export function createFixture(kind = 'dancefloor', x = 600, y = 400, overrides = {}) {
  const spec = FIXTURES[kind] ?? FIXTURES.dancefloor;
  return {
    id: uid('f'),
    kind: FIXTURES[kind] ? kind : 'dancefloor',
    label: spec.label,
    x,
    y,
    w: spec.w,
    h: spec.h,
    rotation: 0,
    ...overrides,
  };
}

export function createGuest(name, extra = {}) {
  return {
    id: uid('g'),
    name: String(name).trim().slice(0, 80) || 'Guest',
    group: '',
    email: '',
    phone: '',
    meal: '',
    notes: '',
    invited: true,
    rsvp: 'pending',
    tableId: null,
    seat: null,
    ...extra,
  };
}

/** Seat positions (relative to table centre, before rotation) and table body size. */
export function tableGeometry(table) {
  const n = table.seats;
  const gap = SEAT_SIZE + 10;
  const off = SEAT_SIZE / 2 + 7;
  let w;
  let h;
  let seats = [];

  if (table.shape === 'round') {
    const r = Math.max(42, (n * gap) / (2 * Math.PI) - 6);
    const ring = r + off;
    w = h = r * 2;
    seats = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      return { x: Math.cos(a) * ring, y: Math.sin(a) * ring };
    });
  } else if (table.shape === 'rect') {
    const top = table.sides === 1 ? n : Math.ceil(n / 2);
    const bottom = n - top;
    w = Math.max(110, Math.max(top, bottom) * gap + 16);
    h = 62;
    const row = (count, y) =>
      Array.from({ length: count }, (_, i) => ({ x: -w / 2 + (w / count) * (i + 0.5), y }));
    seats = [...row(top, -h / 2 - off), ...row(bottom, h / 2 + off)];
  } else {
    const per = [0, 1, 2, 3].map((k) => Math.floor(n / 4) + (k < n % 4 ? 1 : 0));
    const s = Math.max(96, Math.max(...per) * gap + 16);
    w = h = s;
    const along = (count, i) => -s / 2 + (s / count) * (i + 0.5);
    per.forEach((count, side) => {
      for (let i = 0; i < count; i += 1) {
        const t = along(count, i);
        if (side === 0) seats.push({ x: t, y: -s / 2 - off });
        if (side === 1) seats.push({ x: s / 2 + off, y: t });
        if (side === 2) seats.push({ x: -t, y: s / 2 + off });
        if (side === 3) seats.push({ x: -s / 2 - off, y: -t });
      }
    });
  }

  const half = SEAT_SIZE / 2;
  const xs = [-w / 2, w / 2, ...seats.flatMap((p) => [p.x - half, p.x + half])];
  const ys = [-h / 2, h / 2, ...seats.flatMap((p) => [p.y - half, p.y + half])];
  return { w, h, seats, extent: Math.max(...xs.map(Math.abs), ...ys.map(Math.abs)) };
}

/** Axis-aligned bounding box of everything on the canvas, in world coordinates. */
export function contentBounds(data, padding = 60) {
  const boxes = [
    ...data.tables.map((t) => {
      const { extent } = tableGeometry(t);
      return [t.x - extent, t.y - extent, t.x + extent, t.y + extent];
    }),
    ...data.fixtures.map((f) => {
      const r = Math.hypot(f.w, f.h) / 2;
      return [f.x - r, f.y - r, f.x + r, f.y + r];
    }),
  ];
  if (!boxes.length) return { x: 0, y: 0, w: 1200, h: 800 };
  const minX = Math.max(0, Math.min(...boxes.map((b) => b[0])) - padding);
  const minY = Math.max(0, Math.min(...boxes.map((b) => b[1])) - padding);
  const maxX = Math.min(WORLD.width, Math.max(...boxes.map((b) => b[2])) + padding);
  const maxY = Math.min(WORLD.height, Math.max(...boxes.map((b) => b[3])) + padding);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function tableName(table, index) {
  const label = table.label?.trim();
  if (!label) return `Table ${index + 1}`;
  return /^\d+$/.test(label) ? `Table ${label}` : label;
}

export function seatedCount(guests, tableId) {
  return guests.reduce((n, g) => n + (g.tableId === tableId ? 1 : 0), 0);
}

/**
 * Validates and normalises layout data from any untrusted source (file, link, storage).
 * Throws an Error with a readable message when the structure is unusable.
 */
export function normalizeData(raw) {
  if (!isObj(raw)) throw new Error('The layout data is missing.');
  if (!Array.isArray(raw.tables) || !Array.isArray(raw.guests)) {
    throw new Error('The layout is incomplete: tables or guests are missing.');
  }

  const seen = new Set();
  const freshId = (id, prefix) => {
    let next = typeof id === 'string' && id && !seen.has(id) ? id : uid(prefix);
    while (seen.has(next)) next = uid(prefix);
    seen.add(next);
    return next;
  };

  const ev = isObj(raw.event) ? raw.event : {};
  const event = {
    name: str(ev.name, 'Untitled event').slice(0, 120),
    date: str(ev.date).slice(0, 40),
    venue: str(ev.venue).slice(0, 120),
  };

  const tables = raw.tables.filter(isObj).slice(0, 500).map((t) => {
    const shape = SHAPES[t.shape] ? t.shape : 'round';
    const spec = SHAPES[shape];
    return {
      id: freshId(t.id, 't'),
      shape,
      label: str(t.label).slice(0, 60),
      x: clamp(num(t.x, 400), 0, WORLD.width),
      y: clamp(num(t.y, 400), 0, WORLD.height),
      rotation: ((Math.round(num(t.rotation, 0)) % 360) + 360) % 360,
      seats: clamp(Math.round(num(t.seats, spec.seats)), spec.min, spec.max),
      sides: t.sides === 1 ? 1 : 2,
    };
  });

  const fixtures = (Array.isArray(raw.fixtures) ? raw.fixtures : []).filter(isObj).slice(0, 200).map((f) => {
    const kind = FIXTURES[f.kind] ? f.kind : 'dancefloor';
    return {
      id: freshId(f.id, 'f'),
      kind,
      label: str(f.label, FIXTURES[kind].label).slice(0, 60),
      x: clamp(num(f.x, 400), 0, WORLD.width),
      y: clamp(num(f.y, 400), 0, WORLD.height),
      w: clamp(num(f.w, FIXTURES[kind].w), 20, 1200),
      h: clamp(num(f.h, FIXTURES[kind].h), 20, 1200),
      rotation: ((Math.round(num(f.rotation, 0)) % 360) + 360) % 360,
    };
  });

  const byId = new Map(tables.map((t) => [t.id, t]));
  const taken = new Set();
  const rsvpValues = RSVP_STATUSES.map((s) => s.value);
  const guests = raw.guests.filter(isObj).slice(0, 5000).map((g) => {
    let tableId = typeof g.tableId === 'string' ? g.tableId : null;
    let seat = Number.isInteger(g.seat) ? g.seat : null;
    const table = byId.get(tableId);
    const key = `${tableId}:${seat}`;
    if (!table || seat === null || seat < 0 || seat >= table.seats || taken.has(key)) {
      tableId = null;
      seat = null;
    } else {
      taken.add(key);
    }
    return {
      id: freshId(g.id, 'g'),
      name: str(g.name, 'Guest').slice(0, 80) || 'Guest',
      group: str(g.group).slice(0, 60),
      email: str(g.email).slice(0, 120),
      phone: str(g.phone).slice(0, 40),
      meal: str(g.meal).slice(0, 60),
      notes: str(g.notes).slice(0, 500),
      invited: g.invited !== false,
      rsvp: rsvpValues.includes(g.rsvp) ? g.rsvp : 'pending',
      tableId,
      seat,
    };
  });

  const collaborators = (Array.isArray(raw.collaborators) ? raw.collaborators : [])
    .filter(isObj)
    .slice(0, MAX_COLLABORATORS)
    .map((c) => ({
      id: freshId(c.id, 'c'),
      name: str(c.name, 'Collaborator').slice(0, 80),
      email: str(c.email).slice(0, 120),
      role: c.role === 'viewer' ? 'viewer' : 'editor',
      addedAt: str(c.addedAt, new Date().toISOString()),
    }));

  return { event, tables, fixtures, guests, collaborators };
}

export function isEmptyLayout(data) {
  return !data.tables.length && !data.fixtures.length && !data.guests.length;
}
