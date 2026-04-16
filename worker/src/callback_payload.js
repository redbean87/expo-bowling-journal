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
