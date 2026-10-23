import { createDefaultData, createFixture, createTable } from './model.js';

const grid = (cols, rows, x0, y0, dx, dy, make) => {
  const out = [];
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) out.push(make(x0 + c * dx, y0 + r * dy, out.length));
  return out;
};

export const TEMPLATES = [
  {
    id: 'blank',
    name: 'Blank canvas',
    description: 'Start from an empty room.',
    build: () => ({ tables: [], fixtures: [] }),
  },
  {
    id: 'wedding',
    name: 'Classic wedding',
    description: 'Head table, dance floor and 10 rounds of 8.',
    build: () => ({
      tables: [
        createTable({ shape: 'rect', x: 1000, y: 230, seats: 8, sides: 1, label: 'Head table' }),
        ...grid(5, 1, 520, 560, 240, 0, (x, y, i) => createTable({ shape: 'round', x, y, seats: 8, label: String(i + 1) })),
        ...grid(5, 1, 520, 1080, 240, 0, (x, y, i) => createTable({ shape: 'round', x, y, seats: 8, label: String(i + 6) })),
      ],
      fixtures: [
        createFixture('dancefloor', 1000, 830, { w: 420, h: 220 }),
        createFixture('cake', 1440, 230),
        createFixture('bar', 280, 830, { w: 60, h: 220, label: 'Bar' }),
        createFixture('entrance', 1000, 1300),
      ],
    }),
  },
  {
    id: 'banquet',
    name: 'Banquet rows',
    description: 'Long tables for dinners, galas and reunions.',
    build: () => ({
      tables: [
        createTable({ shape: 'rect', x: 1000, y: 220, seats: 10, sides: 1, label: 'Top table' }),
        ...grid(3, 3, 620, 520, 380, 260, (x, y, i) => createTable({ shape: 'rect', x, y, seats: 12, label: String(i + 1) })),
      ],
      fixtures: [createFixture('stage', 1000, 1300, { label: 'Stage' }), createFixture('buffet', 1600, 220)],
    }),
  },
  {
    id: 'party',
    name: 'Cocktail party',
    description: 'Small tables around a bar and DJ booth.',
    build: () => ({
      tables: [
        ...grid(4, 2, 560, 420, 300, 380, (x, y, i) =>
          createTable({ shape: i % 2 ? 'square' : 'round', x, y, seats: i % 2 ? 4 : 6, label: String(i + 1) }),
        ),
      ],
      fixtures: [
        createFixture('dancefloor', 1010, 610, { w: 300, h: 200 }),
        createFixture('dj', 1010, 1060),
        createFixture('bar', 1010, 200, { w: 360 }),
      ],
    }),
  },
  {
    id: 'conference',
    name: 'Workshop / classroom',
    description: 'Square pods facing a stage.',
    build: () => ({
      tables: grid(4, 2, 600, 560, 280, 320, (x, y, i) => createTable({ shape: 'square', x, y, seats: 8, label: `Pod ${i + 1}` })),
      fixtures: [createFixture('stage', 1020, 220)],
    }),
  },
];

/** Applies a template's room to the current event, keeping event details, guests and collaborators. */
export function applyTemplate(templateId, current = createDefaultData()) {
  const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];
  const { tables, fixtures } = template.build();
  return {
    ...current,
    tables,
    fixtures,
    guests: current.guests.map((g) => ({ ...g, tableId: null, seat: null })),
  };
}
