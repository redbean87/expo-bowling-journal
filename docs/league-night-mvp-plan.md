# League Night MVP Plan

## Goal

Ship a simple, mobile-first flow that is reliable during league play, including weak-signal conditions.

## Product Direction

- Prior sign-in is required.
- Core priority is game capture speed and reliability, not analytics/reporting.
- Design should stay clean and modern with minimal cognitive load.

## Must-Have Experience

1. Open app and quickly enter tonight's flow (league -> session -> games)
2. Start or continue game entry with minimal taps
3. Save progress even when offline
4. Clearly understand sync state (`Saved locally`, `Syncing`, `Synced`, `Retry needed`)

## Functional Scope (Phase 1)

- Simplified journal flow focused on league-night entry
- Fast game entry screen with larger touch targets and reduced text input
- Local draft persistence for in-progress frame input
- Local mutation queue for game/session/league writes while offline
- Automatic retry when connectivity returns

## Out of Scope (for this phase)

- Analytics/reporting screens
- Team or coach sharing features
- Advanced conflict resolution beyond single-user device assumptions

## Technical Notes

- Keep Convex as source of truth once synced
- Queue operations locally and replay in order
- Prefer simple conflict rule: latest local edit wins
- Keep queue logic behind service/hooks so UI remains focused on flow

## Acceptance Criteria

- A signed-in user can create or update league-night game data with poor/no signal
- No entered frames are lost if app is backgrounded or closed
- User can identify pending vs synced records from the UI
- Once online, queued writes complete without manual intervention in normal cases
