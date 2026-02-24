import { makeFunctionReference } from 'convex/server';

import type { ImportResult, RawImportTable } from './import_types';
import type { Doc, Id } from '../_generated/dataModel';

export const getBatchByIdForDispatchQueryRef = makeFunctionReference<
  'query',
  { batchId: Id<'importBatches'> },
  {
    _id: Id<'importBatches'>;
    userId: Id<'users'>;
    status: string;
    r2Key: string | null;
  } | null
>('imports:getBatchByIdForCallback');

export const updateBatchStatusForDispatchMutationRef = makeFunctionReference<
  'mutation',
  {
    batchId: Id<'importBatches'>;
    status: 'parsing' | 'importing' | 'completed' | 'failed';
    completedAt?: number | null;
    errorMessage?: string | null;
  },
  Id<'importBatches'>
>('imports:updateBatchStatusForCallback');

export const dispatchImportQueueActionRef = makeFunctionReference<
  'action',
  {
    batchId: Id<'importBatches'>;
    userId: Id<'users'>;
    r2Key: string;
    timezoneOffsetMinutes?: number | null;
  },
  void
>('imports:dispatchImportQueue');

export const deleteUserDocsChunkForImportMutationRef = makeFunctionReference<
  'mutation',
  {
    userId: Id<'users'>;
    table: import('./import_types').ReplaceAllCleanupTable;
    chunkSize?: number;
  },
  { deleted: number }
>('imports:deleteUserDocsChunkForImport');

export const createImportBatchForSnapshotMutationRef = makeFunctionReference<
  'mutation',
  {
    userId: Id<'users'>;
    sourceFileName?: string | null;
    sourceHash?: string | null;
  },
  Id<'importBatches'>
>('imports:createImportBatchForSnapshot');

export const persistRawImportChunkForBatchMutationRef = makeFunctionReference<
  'mutation',
  {
    batchId: Id<'importBatches'>;
    table: RawImportTable;
    rows: unknown[];
  },
  { inserted: number }
>('imports:persistRawImportChunkForBatch');

export const importSqliteSnapshotAfterCleanupMutationRef =
  makeFunctionReference<
    'mutation',
    {
      userId: Id<'users'>;
      batchId?: Id<'importBatches'> | null;
      skipRawMirrorPersistence?: boolean;
      sourceFileName?: string | null;
      sourceHash?: string | null;
      houses: Array<Doc<'importRawHouses'>['raw']>;
      patterns: Array<Doc<'importRawPatterns'>['raw']>;
      balls: Array<Doc<'importRawBalls'>['raw']>;
      leagues: Array<Doc<'importRawLeagues'>['raw']>;
      weeks: Array<Doc<'importRawWeeks'>['raw']>;
      games: Array<Doc<'importRawGames'>['raw']>;
      frames: Array<Doc<'importRawFrames'>['raw']>;
    },
    ImportResult
  >('imports:importSqliteSnapshotAfterCleanupForUser');
