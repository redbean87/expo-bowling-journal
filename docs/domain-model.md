# Bowling Domain Model Specification

> **Status:** Proposed/finalized domain contract pending review before physical SQLite schema design.

This document defines the local bowling domain model that will serve as the contract for the future SQLite schema and PinPal import/export adapters.

## 1. General Principles

* **Local source of truth:** SQLite will hold all bowling data locally.
* **Primary identifiers:** Every entity uses a UUID (`_id`) as the primary key. No foreign user, account, auth token, or Convex ownership data is stored locally.
* **Authoritative data vs derived data vs optional metadata** – see section §6 for distinctions.
* **No Roll or Player/Team/Lane entities** – the only roll‐level information is the per‑frame mask fields `roll1Mask`, `roll2Mask`, and `roll3Mask`.

## 2. Domain Entities

| Entity | Purpose | Authoritative Fields | Optional / Metadata | Derived / Computed | Relationships | Notes |
|--------|---------|-----------------------|---------------------|--------------------|---------------|-------|
| **League** | Collection of sessions for a user. | `name` | `clientSyncId`, `gamesPerSession`, `houseId`, `houseName`, `startDate`, `endDate`, `legacyFlags`, `isOpenBowling`, `type` | – | `sessions` | No userId field stored locally. | 
| **Session** | A scheduled set of games within a league. | `date` | `clientSyncId`, `weekNumber`, `houseId`, `ballId`, `patternId`, `notes`, `laneContext` (left/right/lanePair/startingLane) | – | `games` | 
| **Game** | Individual bowling game. | `date` | `ballId`, `patternId`, `handicap`, `notes`, `laneContext`, `ballSwitches` (array of `{frameNumber, rollNumber, ballId, ballName, note}`) | `totalScore`, `strikes`, `spares`, `opens` | `frames` | 
| **Frame** | A single frame within a game. | `frameNumber`, `roll1Mask`, `roll2Mask`, `roll3Mask`, `ballId` | `flags`, `pocket`, `footBoard`, `targetBoard` | derived *roll pin count* (from mask), *frame score*, *isStrike*, *isSpare*, *isOpen*, *isIncomplete*, *canHaveBonusRoll* | `game` | **Pattern** & **House** are referenced via foreign UUIDs. |
| **Ball** | Physical bowling ball. | `name`, `brand`, `coverstock` | *nameNorm* | – | – | – |
| **Pattern** | Oil / lane pattern. | `name`, `length` | *nameNorm* | – | – | – |
| **House** | Bowling alley location. | `name`, `location` | *nameNorm* | – | – | – |

> **Important:** The Convex tables also contain fields such as `roll1`, `roll2`, `roll3`, `pins`, `scores`, `score`, `flags`, `pocket`, etc. In the local domain those numeric roll fields are *not* authoritative. The authoritative data are the mask fields and the derived values are calculated from them.

## 3. Authoritative Roll Representation

* `roll1Mask`, `roll2Mask`, `roll3Mask` – nullable 10‑bit unsigned integers.
* Each mask encodes which pins were knocked down in that roll. A helper `getRollValue(mask)` returns the numeric pin count.
* The packed integer used by PinPal (`pins`) and the helper `packManualPins` are **transport only** – they are only used for serializing data and should not be persisted locally.

## 4. Derived Data

These values are calculated on demand from authoritative fields.

| Derived | Source | Calculation |
|---------|--------|-------------|
| Numeric roll pin count | `rollXMask` | `getRollValue(mask)` |
| Frame score | Frame's rolls + bonus logic per bowling rules | See §5 § Scoring Rules |
| Game total score | Sum of frame scores | Summation |
| Strike count / Spare count / Open count | Count of frames with strike / spare / open status | Count |
| Frame preview | Human‑readable text for incomplete frames | Derived through `frameSymbols` logic |

Derived values must **not** be stored in SQLite unless a future implementation decides to cache them; any cached value must remain reproducible from the authoritative frame data.

## 5. Scoring Rules (Authoritative)

The existing implementation in the codebase is the source of truth.

* **Frames 1–9** – normal 10‑pin rules.
  * **Strike** – `roll1Mask` = 10 pins; `roll2Mask` and `roll3Mask` are `null`.
  * **Spare** – total pins in `roll1Mask` + `roll2Mask` = 10.
  * **Open frame** – total < 10.
  * **Incomplete frame** – only `roll1Mask` set or `roll1Mask` + `roll2Mask` incomplete.
* **Tenth frame** – special logic.
  * If first roll is a strike → two bonus rolls (`roll2Mask` and `roll3Mask`) allowed.
  * If first two rolls make a spare → one bonus roll (`roll3Mask`).
  * No bonus rolls if open tenth frame.
  * Validation ensures pin overrun is not allowed in any frame.
* **Scoring calculation** – follows standard bowling scoring algorithm: strike bonus is sum of next two rolls, spare bonus is next roll.
* **Provisional scoring** – during editing, score for incomplete frame is calculated on‑the‑fly.
* **Settled scoring** – once all rolls exist, scores are calculated on demand and not persisted in the local SQLite schema (e.g., derived from masks).
* **Editing / clearing a roll** – clears mask(s) and re‑evaluates the subsequent frames’ scores appropriately.

The implementation lives in `src/screens/game-editor/**` modules such as `frame-scoring.ts`, `frame-validation.ts`. All rules are enforced by validation logic there.

## 6. Validation Rules

| Rule | Description |
|------|-------------|
| Roll 1 required before Roll 2 | Cannot set `roll2Mask` if `roll1Mask` is `null`. |
| Roll 2 required before Roll 3 | Cannot set `roll3Mask` if `roll2Mask` is `null` (unless tenth frame where exception). |
| Strikes skip Roll 2 in frames 1–9 | When `roll1Mask` = 10, `roll2Mask` must be `null`. |
| Pins ≤ 10 across two rolls (frames 1–9) | Sum of `roll1Mask` and `roll2Mask` cannot exceed 10. |
| Stand‑up validation | `roll2Mask` can only knock down pins that stood after previous roll. |
| Tenth‑frame bonus logic | See §5. |
| No bonus after open tenth frame | `roll3Mask` must be `null` if tenth frame is open. |
| Pin overrun | No roll mask may contain extra pins beyond 10 for frame. |

Incomplete state is distinguished from invalid state: missing mandatory masks in a frame is considered *incomplete* (i.e., not yet scored), whereas any violation of the above rules is *invalid* and must be rejected by the UI.

## 7. Ball Association

* The current model records `ballId` in `Game` and optionally in `Session`. Ball switching is handled at the frame boundary using the `ballSwitches` array (each entry indicates a new ball in a specific frame). No per‑roll ball association exists, and mid‑frame ball changes are not supported. This limitation is a documented product decision and will be reflected in the SQLite representation until an updated domain model is agreed upon.

## 8. PinPal Compatibility

### 8.1. Export File Structure and Metadata

* **Android** export is a raw SQLite database. The first byte offset is `0`.
* **iOS** export has a 4096‑byte header/wrapper. The SQLite payload starts at byte offset `4096`.

### 8.2. Shared Tables

All PinPal exports contain the following domain tables:

* `league`
* `week`
* `game`
* `frame`
* `ball`
* `house`
* `pattern`

### 8.3. Hierarchy

The logical relationship present in the database is:

```
League → Week → Game → Frame
```

### 8.4. Platform Differences

* Primary key column names differ: Android uses `_id`, whereas iOS uses `pk`.
* Android includes extra foreign‑key columns omitted in iOS:
  * `lane` on `week` and `game`
  * `pocket`, `footBoard`, `targetBoard` on `frame`
  * `sortOrder` on reference tables where present
* Android may contain the platform‑specific table `android_metadata`. This record is *not* part of the bowling domain.

### 8.5. Frame and Game Data

* The packed `pins` integer and `scores` array are part of the import payload but must be preserved losslessly.
* `pins` is **not** a simple count; it may encode roll‑by‑roll pin data.
* A frame row may be pre‑allocated, including rows never played. Unplayed frames are identified by sentinel values:
  * Android: `pins = 1048575` (0xFFFFF)
  * iOS:   `pins = 1073741823` (0x3FFFFFFF)
* Games can contain up to 12 frame rows (including tenth‑frame and bonus slots) but this does not imply all frames are completed.
* The fields `singlePinSpareScore` and `notes` must be transferred as‑is.

### 8.6. Relationships and Identifiers

* All source integer IDs should be mapped to local UUIDs when imported.
* Treat `0` and `-1` as **none**/unassigned sentinels; normalize them to `NULL` in local foreign‑key columns.

### 8.7. Dates

* Android dates are stored as Unix timestamps in **milliseconds**.
* iOS dates are stored as Unix timestamps in **seconds** with fractional precision.

### 8.8. Optional Fields

* Android‑only fields should become optional import‑time columns; they must not be dropped.
* `pattern` records are optional – Android exports may omit them entirely.

*The above observations are based on the fixture files and are not assumptions about all PinPal releases.*

| PinPal Entity | Local Equivalent | Notes |
|--------------|-----------------|-------|
| `PinPal Ball` | `Ball` | Direct mapping by ID. |
| `PinPal Pattern` | `Pattern` | Direct mapping by ID. |
| `PinPal House` | `House` | Direct mapping by ID. |
| `PinPal Week` | `Session` | `weekNumber` maps to the PinPal “week” number. |
| `PinPal Game` | `Game` | Primary fields (`date`, `notes`, etc.) map over. |
| `PinPal Frame` | `Frame` | Only mask fields are authoritative; numeric `pins` field in PinPal is **not** stored locally. |

The PinPal `pins` representation (packed integer) is an interchange format. Local tables store only the per‑frame mask fields.

### 8.9. Local Fixtures

Sample PinPal exports are kept locally under `fixtures/pinpal/` and are **not** committed:

* `cortez-android.pinpal` – Android export (raw SQLite, payload at byte offset `0`).
* `tj-ios.pinpal` – iOS export (SQLite payload at byte offset `4096`).

Both `*.pinpal` and `/fixtures/pinpal/` are listed in `.gitignore`, so each contributor supplies their own copies.

The import tests resolve their fixtures from the repository root and skip when the file is absent:

| Test | Fixture (repo root) |
|------|---------------------|
| `tests/import/worker_snapshot_transport.test.ts` | `Backup.pinpal` |
| `tests/import/pinpal_lite_compound_parse_test.test.ts` | `Backup(TJ).pinpal` |

To run these tests locally, place or copy a fixture at the expected root path (for example, `cp fixtures/pinpal/cortez-android.pinpal Backup.pinpal`).

## 9. Optional Persisted Metadata

Fields that are optional and may be left `null` but persisted if the user provides them.

* `handicap`, `notes`, `laneContext`, `ballSwitches` (in `Game`), `flags`, `pocket`, `footBoard`, `targetBoard`.

These are stored as-is when present. The application logic treats missing values as defaults.

## 10. Derived vs Persisted vs UI‑Only

| Category | Fields | Persistence | Notes |
|----------|--------|-------------|-------|
| Authoritative | All fields listed above (e.g., `roll1Mask`, `ballId`, `name`) | Yes – stored in SQLite | Base of all calculations |
| Derived | Numeric roll counts, frame scores, game totals, strike/spare counts, frame preview | No – calculated live | Must remain reproducible from authoritative data |
| Optional metadata | `handicap`, `notes`, `laneContext`, `flags`, etc. | Yes – stored when provided | User‑configurable but not required |
| UI‑only | e.g., `game.totalScoreComputed`, `frame.isOpenState` | No – derived | Only needed for rendering |

Ensuring derived values are **not** persisted will prevent accidental divergence between authoritative data and cached scores.

---

**Next Steps:**

1. Review this specification with the team.
2. Once approved, proceed to design the SQLite schema using these definitions.
3. Validate that import/export adapters correctly map PinPal data to the local authoritative fields.
