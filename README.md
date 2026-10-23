# Seatcraft — seating planner

React + GSAP + Three.js app for planning seating at weddings, parties and other events. It runs entirely in the browser, with no server and no account.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

## Pages
- `/`: home page with a Three.js banquet scene in the hero, a pinned "Introducing Seatcraft" section where a raspberry velvet and rose-gold chair assembles as you scroll (GSAP ScrollTrigger + Three.js), and an overview of the features.
- Light and dark themes: follows the OS setting until you use the sun/moon toggle (remembered in the browser). Exports always render light for printing.
- `/plan`: the planner. Floor canvas, guest list, RSVPs, templates, import/export, sharing and collaborators.

## Where things live
| File | Purpose |
| --- | --- |
| `src/lib/layoutStorage.js` | **Task 1**: `exportJson`, `importJson`, `parseLayout`, `migrate`, `exportPng`, `exportPdf`, `exportGuestListPdf`, `createShareLink`, `loadFromShareLink` |
| `src/lib/storage.js` | **Task 2**: draft storage adapter (`load`/`save`/`clear`/`subscribe`). Swap `draftStore` to move to a database. |
| `src/hooks/useAutosave.js` | **Task 2**: 500 ms debounced autosave, flushes on `visibilitychange`/`beforeunload`/`pagehide`, and a status for the Saved/Saving… indicator |
| `src/lib/model.js` | Data model, table geometry, validation (`normalizeData`) |
| `src/lib/planReducer.js` | All edits + undo/redo |
| `src/lib/importGuests.js` | Excel/CSV parsing, column mapping, paste-a-list |
| `src/lib/templates.js` | Venue templates |

## File formats
- Layout file (`<name>-layout.json`): `{ "version": 1, "app": "seatcraft", "savedAt": ISO, "data": layout }`. Older versions are upgraded by `MIGRATIONS` in `layoutStorage.js` (a v0 example is included).
- Draft in `localStorage["seatcraft:draft"]`: `{ "version": 1, "savedAt": ISO, "data": { layout, view } }`. If the draft is corrupted or has an unknown version, it is ignored and the app starts from the default state.

## Notes on "real-time" and collaborators
Without a backend, live updates work between tabs and windows **on the same browser**, using `storage` events. A share link or invite link contains a compressed **snapshot** of the plan. For cross-device real-time editing, add a cloud adapter with the same interface as `draftStore` and a cloud option next to `layoutStorage.js`.
