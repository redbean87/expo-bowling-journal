/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as frames from "../frames.js";
import type * as games from "../games.js";
import type * as http from "../http.js";
import type * as imports from "../imports.js";
import type * as leagues from "../leagues.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_game_frame_preview from "../lib/game_frame_preview.js";
import type * as lib_import_callback_hmac from "../lib/import_callback_hmac.js";
import type * as lib_import_callback_validation from "../lib/import_callback_validation.js";
import type * as lib_import_canonical_frames from "../lib/import_canonical_frames.js";
import type * as lib_import_dates from "../lib/import_dates.js";
import type * as lib_import_game_stats from "../lib/import_game_stats.js";
import type * as lib_import_raw_frames from "../lib/import_raw_frames.js";
import type * as lib_import_refinement from "../lib/import_refinement.js";
import type * as lib_import_snapshot from "../lib/import_snapshot.js";
import type * as lib_import_warning_summary from "../lib/import_warning_summary.js";
import type * as sessions from "../sessions.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  frames: typeof frames;
  games: typeof games;
  http: typeof http;
  imports: typeof imports;
  leagues: typeof leagues;
  "lib/auth": typeof lib_auth;
  "lib/game_frame_preview": typeof lib_game_frame_preview;
  "lib/import_callback_hmac": typeof lib_import_callback_hmac;
  "lib/import_callback_validation": typeof lib_import_callback_validation;
  "lib/import_canonical_frames": typeof lib_import_canonical_frames;
  "lib/import_dates": typeof lib_import_dates;
  "lib/import_game_stats": typeof lib_import_game_stats;
  "lib/import_raw_frames": typeof lib_import_raw_frames;
  "lib/import_refinement": typeof lib_import_refinement;
  "lib/import_snapshot": typeof lib_import_snapshot;
  "lib/import_warning_summary": typeof lib_import_warning_summary;
  sessions: typeof sessions;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
