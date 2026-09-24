# Local-First Architecture and Implementation Plan

> **Status:** Authoritative.
>
> This document is the working plan for moving PinPal to a fully local-first bowling
> application. It records the approved architecture, invariants, and the sequence of
> small implementation packets that Qwen may execute one at a time.
>
> **Authority:** This document is authoritative for the local-first architecture.
> `docs/domain-model.md` remains authoritative for bowling scoring and the approved
> frame representation. `convex_data_schema_locked.md` is legacy reference material.
>
> **Important:** This document is a plan. It does not itself implement code.

---

## 0. How to use this plan

The implementation is intentionally divided into **small work packets**.

Each packet is designed for **one Qwen session**.

Qwen must never assume that completing one packet authorizes the next packet.

### Required Qwen workflow

```text
ANALYZE
  ↓
REPORT
  ↓
HUMAN APPROVAL
  ↓
IMPLEMENT
  ↓
VERIFY
  ↓
REPORT
  ↓
STOP
```

Silence is not approval.

### Rules for every packet

1. Work only on the named packet.
2. Read only the files needed for that packet.
3. Do not perform work from later packets.
4. Do not make architectural/product decisions.
5. If a material ambiguity is discovered, stop and report it.
6. Do not add dependencies unless the packet explicitly authorizes it.
7. Do not change the canonical model unless the packet explicitly authorizes it.
8. Do not remove Convex, authentication, or legacy synchronization machinery unless the packet explicitly authorizes it.
9. Run only the verification commands that are actually relevant and report exactly what was run.
10. Do not make Git commits unless explicitly instructed.
11. A packet is complete only when its acceptance criteria are satisfied.

### Context rule

Qwen has a limited context window. A packet must be small enough that Qwen can understand the
relevant code without loading the whole repository.

If a packet requires broad repository exploration, split it into smaller packets before implementation.

---

# 1. Product direction

These decisions are settled.

- The application is **fully local-first**.
- Normal bowling requires **no sign-in**.
- Normal bowling requires **no network**.
- Local data is authoritative.
- Import/export is a first-class capability.
- Data moves between devices through files.
- Cloud synchronization is not part of the core bowling workflow.
- The internal model does not need to match PinPal's schema.

Consequences:

- A bowler can use normal bowling features without an account.
- A bowler can use normal bowling features while offline.
- Portability is file-based rather than cloud-sync-based.
- Convex/authentication remain temporarily only where the migration plan says they remain.

---

# 2. Canonical local model

The canonical model represents bowling independently of Convex, authentication, network state,
or PinPal storage.

## 2.1 Canonical entities

Exactly seven canonical bowling entities:

| Entity | Purpose |
|---|---|
| **League** | Long-running competition/collection of sessions. |
| **Session** | A set of games, either associated with a league or casual/open bowling. |
| **Game** | One bowling game. |
| **Frame** | One frame; the authoritative bowling record. |
| **Ball** | A physical bowling ball. |
| **House** | A bowling center/location. |
| **Pattern** | A lane/oil pattern. |

Canonical entities use local UUIDs.

They must not depend on:

- Convex IDs
- user IDs
- `clientSyncId`
- authentication
- network availability
- server synchronization
- PinPal IDs
- PinPal packed storage representations

## 2.2 Session and open bowling

Open bowling is native.

The canonical shape is:

```text
League
  └── Session
        └── Game
              └── Frame
```

A session may have:

```ts
leagueId: UUID | null
```

- `leagueId != null` → league session.
- `leagueId == null` → open/casual session.

There is no synthetic `"Open Bowling"` league.

A game always belongs to a session.

## 2.3 Game context

A game may carry its own:

- house
- ball
- pattern
- lane context
- handicap
- notes
- ball-switch information

`games.houseId` belongs in the canonical model.

League updates must not erase or unnecessarily duplicate house information.

## 2.4 Frames

Frames are authoritative.

The approved representation is the per-frame mask representation defined by
`docs/domain-model.md`:

```text
roll1Mask
roll2Mask
roll3Mask
```

PinPal's packed `pins` field is an external representation, not canonical storage.

Game scores, statistics, previews, and presentation summaries are derived from frames and may be
cached for performance.

A cached/derived value must always be reproducible from frames.

## 2.5 Metadata

Canonical entities may have:

```ts
metadata: Record<string, unknown> | null
```

Metadata is an extension mechanism, not a substitute for proper modeling.

Important bowling concepts remain first-class fields.

Metadata is appropriate for:

- source-specific information
- optional external fields
- information we want to preserve but do not need to query as core domain data

Normal scoring and normal bowling workflows must not depend on metadata.

## 2.6 No silent data loss

Editing a game must preserve every canonical field that the edit did not explicitly change.

Importing and migrating data must preserve meaningful canonical bowling information.

The existing `frames.replaceForGame` data-loss problem must not be reproduced.

## 2.7 Implementation artifacts are not canonical data

These are implementation artifacts:

- `clientSyncId`
- `referenceUsage`
- `callbackNonces`
- `importBatches`
- `importRaw*`
- `userSettings.importSources`
- server synchronization state
- server import lifecycle state
- old offline queue/draft/client-sync-map machinery

They are not to be promoted into the canonical local model.

---

# 3. Local architecture

Target architecture:

```text
                    Expo application
                           │
                           ▼
                 Local domain/data service
                           │
                           ▼
                        SQLite
                   authoritative store
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
       Local importer              Local exporter
              │                         │
              ▼                         ▼
      external / PinPal           versioned .pinpal
           formats                    format
```

UI code should consume the local service rather than directly manipulating SQLite.

SQLite is the local persistence technology.

The local service owns domain-oriented reads/writes and protects invariants.

---

# 4. Import/export architecture

Import/export is an adapter boundary:

```text
IMPORT

external file
    ↓
parser
    ↓
canonical model
    ↓
SQLite
```

```text
EXPORT

SQLite
    ↓
canonical model
    ↓
export adapter
    ↓
portable file
```

PinPal compatibility is an adapter concern.

PinPal integer IDs are provenance/source identifiers, not canonical IDs.

PinPal's packed pin representation is an interchange representation, not canonical storage.

The supplied PinPal fixtures are the compatibility bar for import.

Our own export format will be:

- versioned
- self-describing
- portable
- independent of Convex
- independent of authentication
- independent of network availability
- capable of round-tripping canonical bowling data

Our own exported canonical UUIDs are preserved on re-import.

External PinPal imports receive new local UUIDs.

---

# 5. Import policy

Local import is **non-destructive by default**.

Import adds imported data to the local store.

It must not silently:

- replace all local data
- overwrite unrelated local entities
- merge records by fuzzy matching
- delete existing data

The first implementation does not perform automatic fuzzy deduplication.

If destructive "replace all local data" functionality is ever added, it must be an explicit user
operation.

---

# 6. Migration principles

1. Local storage becomes authoritative before server functionality is demoted.
2. No silent data loss.
3. External formats are adapted into the canonical model.
4. Implementation artifacts are not carried into the canonical model.
5. The old offline synchronization machinery is superseded rather than extended.
6. Existing Convex/server infrastructure remains until its explicit removal packet.
7. Existing server-stored data, if migration is required, moves through a file-based migration path:
   server export → local import.
8. Early packets do not modify unrelated local storage or server infrastructure.

---

# 7. Work packet sequence

There are **48 implementation packets** below.

Each packet is intended to fit into one focused Qwen session.

A packet should normally involve one small architectural layer or one bounded code change.

---

## Phase A — Lock the specification

### Packet A1 — Reconcile the canonical-model documentation

**Purpose:** Make this document and `docs/domain-model.md` internally consistent.

**Qwen may:**

- inspect the two documents
- identify contradictions
- make documentation-only corrections needed to express the already-settled decisions
- update references that still describe the old canonical model

**Qwen may not:**

- modify application code
- modify SQLite/schema
- install dependencies
- remove Convex/auth
- change scoring rules
- invent new domain concepts

**Done when:**

- the two documents agree on frame representation
- open bowling is represented as `Session.leagueId = null`
- metadata shape is recorded
- `games.houseId` is canonical
- no unresolved Stage 1 architecture placeholders remain

---

### Packet A2 — Lock the canonical field inventory

**Purpose:** Produce a precise field-level inventory for the seven canonical entities.

**Qwen may:**

- inspect existing schema/domain documentation
- document each canonical field
- classify fields as authoritative, derived/cacheable, or metadata
- identify fields that are deliberately not carried forward

**Qwen may not:**

- change application code
- add schema
- invent fields not supported by the approved model

**Done when:** the canonical model can be implemented without Qwen needing to make domain decisions.

---

### Packet A3 — Lock the migration invariants

**Purpose:** Make the no-loss and dependency rules explicit enough to test.

Document:

- local UUID identity
- frames as source of truth
- derived-value rules
- no silent data loss
- forbidden server/auth dependencies
- import/export adapter boundary

No code changes.

---

## Phase B — SQLite foundation

### Packet B1 — Inspect existing SQLite/runtime options

**Purpose:** Determine the smallest compatible SQLite implementation already supported by the
application/runtime.

**Qwen may:**

- inspect package.json
- inspect Expo configuration
- inspect existing native/database usage
- report viable existing options

**Qwen may not:**

- install anything
- modify dependencies
- choose a new library

**Done when:** Qwen reports facts and stops.

**Human gate:** We approve the concrete SQLite package/engine.

---

### Packet B2 — Add the approved SQLite dependency

**Purpose:** Add only the previously approved SQLite dependency.

**Scope:**

- dependency change
- minimal configuration required to make it usable

**No domain schema. No UI. No service layer.**

**Done when:** dependency is installed/configured and a minimal runtime check can open SQLite.

---

### Packet B3 — Create the local database module

**Purpose:** Create the smallest database lifecycle layer.

It should provide:

- open/create database
- migration/version entry point
- connection lifecycle

No canonical tables yet beyond what is necessary for the foundation.

**Done when:** database opens locally with no network and no account.

---

### Packet B4 — Create canonical SQLite schema

**Purpose:** Implement the locked seven-entity schema.

Tables correspond to:

- leagues
- sessions
- games
- frames
- balls
- houses
- oil patterns

Include:

- local UUIDs
- foreign keys
- required indexes
- metadata
- canonical frame mask fields
- game context fields

Do not wire the application UI to this database.

---

### Packet B5 — Add schema migration/version tests

**Purpose:** Verify database creation and migration behavior.

Tests must cover:

- fresh database
- schema version
- reopen
- basic write/read
- foreign-key behavior
- no-network operation

---

## Phase C — Local domain/data service

### Packet C1 — Define the local service interface

**Purpose:** Define the UI-facing local service contract.

The interface should cover only the canonical domain operations required by the current app.

It should be domain-oriented, not SQL-oriented.

Examples:

```text
createLeague
updateLeague
getLeague
listLeagues

createSession
updateSession
getSession
listSessions

createGame
updateGame
getGame
listGames

replaceGameFrames
getGameFrames
```

Reference-data operations cover balls, houses, and patterns.

No UI rewiring.

---

### Packet C2 — Implement league/session persistence

Implement local service operations for:

- leagues
- sessions
- open sessions (`leagueId = null`)
- league/session relationships

Test create/read/update/delete behavior.

---

### Packet C3 — Implement reference-data persistence

Implement:

- balls
- houses
- oil patterns

Verify meaningful fields and metadata survive round-trips.

---

### Packet C4 — Implement game/frame persistence

Implement:

- game creation/update
- game context
- frame persistence
- frame replacement/update

Explicitly verify that editing a game does not drop:

- ball information
- house information
- pattern information
- lane information
- notes
- handicap
- ball-switch information
- frame fields

---

### Packet C5 — Implement derived scoring/statistics

Implement or connect the local service to derived game statistics.

Rules:

- frames are authoritative
- derived values come from frames
- cached values are optional
- cached values must be reproducible

Use `docs/domain-model.md` for scoring rules.

---

### Packet C6 — Local service integration tests

Test:

- canonical round-trips
- game edits
- frame edits
- derived statistics
- open bowling
- reference data
- metadata preservation
- no silent loss

No UI changes.

---

## Phase D — Remove the account requirement from normal bowling

### Packet D1 — Audit authentication gates

**Purpose:** Identify every authentication/sign-in gate affecting normal bowling.

Qwen reports:

- file
- route/component
- gate
- why it exists
- whether it belongs to normal bowling

No changes.

---

### Packet D2 — Remove normal-bowling sign-in gate

Remove only the gates identified and approved in D1.

Do not remove authentication infrastructure.

Do not change Convex.

---

### Packet D3 — Verify no-account startup/bowling path

Verify the normal bowling path works:

- without an account
- without network
- through the existing UI

Report actual checks only.

---

## Phase E — Move the bowling UI to local storage

This phase is deliberately split by workflow.

### Packet E1 — Audit journal reads/writes

Identify the current Convex-backed journal operations for:

- leagues
- sessions
- games
- frames
- reference data

No changes.

---

### Packet E2 — Rewire league/session journal workflow

Move league/session reads and writes to the local service.

Do not touch game editor yet.

---

### Packet E3 — Rewire game loading/history

Move game/session history reads to local storage.

Do not modify frame editing yet.

---

### Packet E4 — Rewire game creation/update

Move game creation and game metadata updates to the local service.

Verify all canonical game context survives.

---

### Packet E5 — Rewire frame entry/editing

Move frame writes and frame reads to the local service.

Verify scoring behavior remains unchanged.

---

### Packet E6 — Rewire reference-data workflows

Move local bowling use of:

- balls
- houses
- oil patterns

to the local service.

---

### Packet E7 — Remove remaining Convex reads/writes from normal bowling

Search specifically for normal-bowling Convex dependencies.

Remove only those dependencies.

Do not remove Convex itself.

---

### Packet E8 — End-to-end local bowling verification

Verify:

```text
launch
→ create/open session
→ create game
→ enter frames
→ edit game
→ view history
→ restart app
→ data remains
```

with:

- no account
- no network

This is the first full local-authoritative bowling milestone.

---

## Phase F — Local import

### Packet F1 — Define the local import adapter boundary

Document and implement the interface:

```text
file
→ parser
→ canonical objects
→ local service
```

No PinPal parsing yet.

---

### Packet F2 — Port PinPal fixture parsing

Port the existing PinPal parsing logic into a local adapter.

The adapter must understand the supplied Android and iOS fixtures.

It must not write directly to SQLite.

---

### Packet F3 — Map PinPal data to canonical entities

Implement:

```text
PinPal
→ League
→ Session
→ Game
→ Frame
→ Ball
→ House
→ Oil Pattern
```

Preserve meaningful source data.

Map PinPal IDs to new local UUIDs.

Preserve useful source-specific information in metadata.

---

### Packet F4 — Import through the local service

Connect:

```text
file
→ parser
→ canonical model
→ local service
→ SQLite
```

Use the previously approved additive/non-destructive import behavior.

---

### Packet F5 — PinPal fixture verification

Import both supplied fixtures.

Verify meaningful bowling data is preserved, including:

- hierarchy
- frames
- scores
- pins/masks
- balls
- houses
- patterns
- lane information
- notes
- handicap
- other meaningful source data

Report discrepancies rather than silently changing the model.

---

## Phase G — Local export

### Packet G1 — Define the own export format

Use a versioned, self-describing `.pinpal` JSON-based document.

Minimum envelope:

```json
{
  "format": "pinpal",
  "version": 1,
  "exportedAt": "...",
  "data": {}
}
```

The exact field layout must mirror the canonical model rather than the PinPal database schema.

---

### Packet G2 — Implement canonical serialization

Implement:

```text
SQLite
→ canonical model
→ version 1 export document
```

Preserve canonical UUIDs.

---

### Packet G3 — Implement file export

Implement writing/sharing the versioned export file locally.

No server involvement.

---

### Packet G4 — Implement own-format import

Implement parsing of our version 1 export back into canonical entities.

Preserve UUIDs.

---

## Phase H — Round-trip and compatibility verification

### Packet H1 — Own-format round-trip tests

Test:

```text
canonical
→ export
→ import
→ canonical
```

Acceptance means canonical-equivalent data with preserved UUID identity.

---

### Packet H2 — PinPal compatibility regression tests

Keep fixture-based tests for:

- Android fixture
- iOS fixture

Assert meaningful canonical data preservation.

---

### Packet H3 — End-to-end offline import/export test

Verify:

```text
import file
→ local data
→ export file
→ import exported file
→ equivalent local data
```

with no account and no network.

---

## Phase I — Remove superseded infrastructure

### Packet I1 — Audit old offline machinery

Identify all remaining:

- `clientSyncId`
- create queues
- game-save queues
- draft storage used only for server synchronization
- client sync maps
- reference-usage sync machinery
- retry/replay logic

No removal yet.

---

### Packet I2 — Remove old offline machinery

Remove only the machinery audited and approved in I1.

Do not remove local SQLite.

Do not remove local import/export.

Do not remove Convex yet.

---

### Packet I3 — Reconcile offline-support contract

Update `docs/offline-support-contract.md` to describe the local-authoritative architecture.

Verify no entered bowling data is lost.

---

## Phase J — Remove server-dependent import/export

### Packet J1 — Audit server import/export surface

Identify:

- Convex import lifecycle
- Worker parsing/upload paths
- R2 storage dependencies
- queue/callback machinery
- raw import mirrors
- server export paths
- related health/readiness checks

No removal yet.

---

### Packet J2 — Remove server import infrastructure

Remove only the approved server-side import pipeline.

Verify local import remains functional.

---

### Packet J3 — Remove server export infrastructure

Remove only the approved server-side export pipeline.

Verify local export remains functional.

---

### Packet J4 — Clean server import/export references

Remove:

- obsolete types
- lifecycle state
- callbacks
- raw mirrors
- dead configuration
- obsolete health/readiness dependencies

Do not remove unrelated Convex/auth functionality.

---

## Phase K — Final reconciliation

### Packet K1 — Reconcile architecture documentation

Review and update:

- `ARCHITECTURE.md`
- `docs/domain-model.md`
- `docs/offline-support-contract.md`
- `docs/sqlite-backup-format.md`
- `convex_data_schema_locked.md`

Ensure none contradicts the local-first authority.

---

### Packet K2 — Reconcile AGENTS.md

Review AI-agent guardrails that still describe:

- Convex-authoritative data
- old offline queues
- authentication requirements
- obsolete import/export machinery

Update only the relevant guardrails.

Do not weaken the approval model.

---

### Packet K3 — Final dead-code/reference audit

Search for removed artifacts and obsolete architectural assumptions.

Examples:

```text
clientSyncId
referenceUsage
callbackNonces
importBatches
importRaw
game-save-queue
client-sync-map
server import
server export
```

Separate legitimate historical/documentation references from active-code references.

---

### Packet K4 — Final verification

Run the appropriate repository checks:

```text
npm run typecheck
npm run lint
npm test
```

Run worker checks only if the worker remains relevant to the changed code.

Verify:

- no account required for normal bowling
- no network required for normal bowling
- local SQLite is authoritative
- import/export are local
- own-format round-trip works
- PinPal fixtures remain compatible
- no silent data loss
- frames remain authoritative

Report only checks actually run.

---

# 8. Packet boundaries

These boundaries are mandatory.

| From | To | Boundary |
|---|---|---|
| A | B | Documentation/model must be locked before database implementation. |
| B | C | SQLite exists before the local service is implemented. |
| C | D | Local service exists before normal bowling is detached from auth. |
| D | E | No-account access is separate from data-source migration. |
| E | F | Normal bowling works locally before import is migrated. |
| F | G | Local import works before own export is implemented. |
| G | H | Both directions exist before round-trip verification. |
| H | I | Compatibility is proven before old sync machinery is removed. |
| I | J | Local authoritative storage replaces old offline machinery before server import/export removal. |
| J | K | Server-dependent import/export is gone before final documentation cleanup. |

---

# 9. Shared verification rules

Every implementation packet must verify only what it actually changes.

## Required principles

### Offline

Normal bowling must function with networking unavailable.

### No account

Normal bowling must function without sign-in.

### No silent data loss

For any write, edit, import, or migration:

```text
before
→ operation
→ after
```

must preserve every canonical value not intentionally changed.

### Frames authoritative

Scores and statistics must remain reproducible from frames.

### No forbidden dependencies

The canonical local model must not depend on:

- Convex
- authentication
- network
- server synchronization
- PinPal IDs
- PinPal packed storage

### Verification honesty

Qwen must never report a command as passed unless it actually ran.

---

# 10. Current architectural decisions

These are settled and must not be reopened by Qwen.

| Decision | Choice |
|---|---|
| Product architecture | Fully local-first |
| Normal bowling account requirement | None |
| Normal bowling network requirement | None |
| Authoritative store | Local SQLite |
| Cloud sync | Not core |
| Portability | Files |
| Canonical entities | League, Session, Game, Frame, Ball, House, Pattern |
| Open bowling | Native session with `leagueId = null` |
| Game house | First-class `games.houseId` |
| Frame representation | `roll1Mask`, `roll2Mask`, `roll3Mask` |
| Frame authority | Frames are authoritative |
| Statistics | Derived/cacheable from frames |
| Canonical identity | Local UUID |
| PinPal IDs | Import provenance only |
| Metadata | `Record<string, unknown> \| null` |
| Import policy | Additive/non-destructive by default |
| Own export | Versioned, self-describing JSON-based `.pinpal` |
| Own-format identity | Preserve canonical UUIDs |
| PinPal import identity | Generate local UUIDs |
| Normal bowling UI | Local service → SQLite |
| Old offline queues | Remove after local migration |
| Server import/export | Remove after local import/export is proven |
| Existing Convex | Retain until explicitly removed by a later approved packet |
| AGENTS.md | Preserve human-approval rules; reconcile obsolete domain guardrails late |

### 10.1 Open items — pending human decision (not settled)

The items below are **not** settled by this document. Qwen must not treat them as decided,
must not schedule or implement them, and must not report them as complete without explicit
human direction.

**Existing server-stored data migration (`server export → local import`)**

- Mechanism (settled, §6 item 7): if migration is required, existing server-stored data moves
  through the file-based path `server export → local import`.
- Packet ownership: **not assigned** to any packet in this plan.
- Completion treatment: **not** part of the definition of completion (§12), and **not** treated
  as already completed.
- Whether migration is required at all: **OPEN — human decision pending.**

This plan neither requires nor completes this migration. Until a human explicitly decides, no
packet may be interpreted as including it, and it must not be reported as done.

---

# 11. What Qwen should receive

Do not give Qwen this entire document when a smaller context will do.

For each session, provide:

1. the relevant packet from §7;
2. the applicable architectural decisions from §10;
3. the minimum relevant files;
4. the instruction to stop after that packet.

The packet is the scope. The rest of this document is authority, not a request to inspect the entire repository.

---

# 12. Definition of completion

The local-first migration is complete when:

- normal bowling works without an account;
- normal bowling works without a network;
- SQLite is authoritative;
- all normal bowling reads/writes use the local service;
- frames are authoritative;
- game edits do not lose canonical bowling data;
- PinPal fixtures import locally without meaningful data loss;
- our own export/import round-trips canonical data and preserves identity;
- old offline synchronization machinery is removed;
- server-dependent import/export is removed;
- documentation and AI-agent guardrails agree with the final architecture.

---

## Final rule

**One Qwen session = one packet.**

If a packet becomes too large to understand and verify within one session, split the packet before asking Qwen to implement it.

*End of document.*
