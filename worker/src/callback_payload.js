export function buildImportingSnapshotJsonCallbackPayload(
  batchId,
  parsedSnapshot
) {
  return {
    batchId,
    stage: 'importing',
    parserVersion: parsedSnapshot.parserVersion,
    snapshotJson: JSON.stringify(parsedSnapshot.snapshot),
  };
}
