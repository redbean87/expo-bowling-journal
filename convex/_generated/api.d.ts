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
import type * as balls from "../balls.js";
import type * as frames from "../frames.js";
import type * as games from "../games.js";
import type * as houses from "../houses.js";
import type * as http from "../http.js";
import type * as imports from "../imports.js";
import type * as leagues from "../leagues.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_game_frame_preview from "../lib/game_frame_preview.js";
import type * as lib_import_batch_lifecycle from "../lib/import_batch_lifecycle.js";
import type * as lib_import_callback_auth from "../lib/import_callback_auth.js";
import type * as lib_import_callback_helpers from "../lib/import_callback_helpers.js";
import type * as lib_import_callback_hmac from "../lib/import_callback_hmac.js";
import type * as lib_import_callback_payload from "../lib/import_callback_payload.js";
import type * as lib_import_callback_processing from "../lib/import_callback_processing.js";
import type * as lib_import_callback_state from "../lib/import_callback_state.js";
import type * as lib_import_callback_validation from "../lib/import_callback_validation.js";
import type * as lib_import_canonical_frames from "../lib/import_canonical_frames.js";
import type * as lib_import_core_refinement from "../lib/import_core_refinement.js";
import type * as lib_import_core_runner from "../lib/import_core_runner.js";
import type * as lib_import_dates from "../lib/import_dates.js";
import type * as lib_import_function_refs from "../lib/import_function_refs.js";
import type * as lib_import_game_stats from "../lib/import_game_stats.js";
import type * as lib_import_queue_dispatch from "../lib/import_queue_dispatch.js";
import type * as lib_import_raw_frames from "../lib/import_raw_frames.js";
import type * as lib_import_raw_mirror from "../lib/import_raw_mirror.js";
import type * as lib_import_refinement from "../lib/import_refinement.js";
import type * as lib_import_replace_all_cleanup from "../lib/import_replace_all_cleanup.js";
import type * as lib_import_snapshot from "../lib/import_snapshot.js";
import type * as lib_import_snapshot_action from "../lib/import_snapshot_action.js";
import type * as lib_import_snapshot_runner from "../lib/import_snapshot_runner.js";
import type * as lib_import_snapshot_storage from "../lib/import_snapshot_storage.js";
import type * as lib_import_start from "../lib/import_start.js";
import type * as lib_import_types from "../lib/import_types.js";
import type * as lib_import_validators from "../lib/import_validators.js";
import type * as lib_import_warning_summary from "../lib/import_warning_summary.js";
import type * as lib_reference_usage from "../lib/reference_usage.js";
import type * as patterns from "../patterns.js";
import type * as referenceUsage from "../referenceUsage.js";
import type * as sessions from "../sessions.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  balls: typeof balls;
  frames: typeof frames;
  games: typeof games;
  houses: typeof houses;
  http: typeof http;
  imports: typeof imports;
  leagues: typeof leagues;
  "lib/auth": typeof lib_auth;
  "lib/game_frame_preview": typeof lib_game_frame_preview;
  "lib/import_batch_lifecycle": typeof lib_import_batch_lifecycle;
  "lib/import_callback_auth": typeof lib_import_callback_auth;
  "lib/import_callback_helpers": typeof lib_import_callback_helpers;
  "lib/import_callback_hmac": typeof lib_import_callback_hmac;
  "lib/import_callback_payload": typeof lib_import_callback_payload;
  "lib/import_callback_processing": typeof lib_import_callback_processing;
  "lib/import_callback_state": typeof lib_import_callback_state;
  "lib/import_callback_validation": typeof lib_import_callback_validation;
  "lib/import_canonical_frames": typeof lib_import_canonical_frames;
  "lib/import_core_refinement": typeof lib_import_core_refinement;
  "lib/import_core_runner": typeof lib_import_core_runner;
  "lib/import_dates": typeof lib_import_dates;
  "lib/import_function_refs": typeof lib_import_function_refs;
  "lib/import_game_stats": typeof lib_import_game_stats;
  "lib/import_queue_dispatch": typeof lib_import_queue_dispatch;
  "lib/import_raw_frames": typeof lib_import_raw_frames;
  "lib/import_raw_mirror": typeof lib_import_raw_mirror;
  "lib/import_refinement": typeof lib_import_refinement;
  "lib/import_replace_all_cleanup": typeof lib_import_replace_all_cleanup;
  "lib/import_snapshot": typeof lib_import_snapshot;
  "lib/import_snapshot_action": typeof lib_import_snapshot_action;
  "lib/import_snapshot_runner": typeof lib_import_snapshot_runner;
  "lib/import_snapshot_storage": typeof lib_import_snapshot_storage;
  "lib/import_start": typeof lib_import_start;
  "lib/import_types": typeof lib_import_types;
  "lib/import_validators": typeof lib_import_validators;
  "lib/import_warning_summary": typeof lib_import_warning_summary;
  "lib/reference_usage": typeof lib_reference_usage;
  patterns: typeof patterns;
  referenceUsage: typeof referenceUsage;
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
