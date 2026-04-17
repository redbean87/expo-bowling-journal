/**
 * @param {string} batchId
 * @param {{parserVersion: string, snapshot: object}} parsedSnapshot
 * @param {number | null} [timezoneOffsetMinutes]
 * @param {'pinpal-sqlite' | 'pinpal-lite-compound' | null} [detectedFormat]
 * @returns {{batchId: string, stage: string, parserVersion: string, timezoneOffsetMinutes: number | null, snapshotJson: string, detectedFormat: 'pinpal-sqlite' | 'pinpal-lite-compound' | null}}
 */
export function buildImportingSnapshotJsonCallbackPayload(
  batchId,
  parsedSnapshot,
  timezoneOffsetMinutes = null,
  detectedFormat = null
) {
  return {
    batchId,
    stage: 'importing',
    parserVersion: parsedSnapshot.parserVersion,
    timezoneOffsetMinutes,
    snapshotJson: JSON.stringify(parsedSnapshot.snapshot),
    detectedFormat,
  };
}
