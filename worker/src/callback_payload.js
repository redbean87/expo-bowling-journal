export function buildImportingSnapshotJsonCallbackPayload(
  batchId,
  parsedSnapshot,
  timezoneOffsetMinutes = null
) {
  return {
    batchId,
    stage: 'importing',
    parserVersion: parsedSnapshot.parserVersion,
    timezoneOffsetMinutes,
    snapshotJson: JSON.stringify(parsedSnapshot.snapshot),
  };
}
