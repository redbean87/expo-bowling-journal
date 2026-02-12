export type ImportedRawFrameRow = {
  sqliteId: number;
  gameFk?: number | null;
  weekFk?: number | null;
  leagueFk?: number | null;
  ballFk?: number | null;
  frameNum?: number | null;
  pins?: number | null;
  scores?: number | null;
  score?: number | null;
  flags?: number | null;
  pocket?: number | null;
  footBoard?: number | null;
  targetBoard?: number | null;
};

export const DEFAULT_RAW_FRAME_CHUNK_SIZE = 500;

export function chunkRawFrameRows(
  rows: ImportedRawFrameRow[],
  chunkSize = DEFAULT_RAW_FRAME_CHUNK_SIZE
) {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error('chunkSize must be a positive integer');
  }

  const chunks: ImportedRawFrameRow[][] = [];

  for (let index = 0; index < rows.length; index += chunkSize) {
    chunks.push(rows.slice(index, index + chunkSize));
  }

  return chunks;
}
