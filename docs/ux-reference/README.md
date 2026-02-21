# UX Reference Screenshots

Use this folder to keep visual references that future sessions can reuse without hunting through chat history.

## Folder Structure

- `docs/ux-reference/competitor-app/`: screenshots from competitor app flows used for UX benchmarking
- `docs/ux-reference/current-app/`: screenshots of the current app state (used as before/after baseline)
- `docs/ux-reference/next-app/`: target visual direction references (including trading journal screenshots)

## Reference Intent

- `competitor-app` captures workflows to compare against and learn from.
- `current-app` captures the latest shipped UX so future iterations can compare deltas quickly.
- `next-app` captures look-and-feel references to adapt into bowling context.
- Visual inspiration can come from non-bowling apps, but interaction design should map to bowling flow (`league -> session -> game`).

## Suggested File Naming

Use a date-first format so screenshots sort chronologically:

- `YYYY-MM-DD-journal-main.png`
- `YYYY-MM-DD-session-select.png`
- `YYYY-MM-DD-game-entry-frame-7.png`

Example:

- `2026-02-12-journal-main.png`

For curated reference sets (like `competitor-app`, `current-app`, and `next-app`), numeric ordering is also acceptable:

- `01-home.png`
- `02-sessions.png`
- `03-games.png`

## Capture Guidance

For competitor-flow screenshots, include these views when possible:

1. Journal main screen
2. League/session selection flow
3. In-progress game entry screen (mid-frame)
4. Any screen that feels slow, cluttered, or hard to use one-handed

## Annotation Tip

If a screenshot has a specific problem to solve, add a sibling markdown note with the same base name.

Example:

- `2026-02-12-game-entry-frame-7.png`
- `2026-02-12-game-entry-frame-7.md`

In the note, include:

- what you were trying to do
- what felt difficult
- what you wish happened instead
