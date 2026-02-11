export type RefinementWarning = {
  recordType: 'session' | 'game';
  recordId: string;
  message: string;
};

export function summarizeImportWarnings(
  warnings: RefinementWarning[]
): RefinementWarning[] {
  const byCategory = new Map<string, RefinementWarning[]>();

  for (const warning of warnings) {
    const key = `${warning.recordType}::${warning.message}`;
    const existing = byCategory.get(key);

    if (existing) {
      existing.push(warning);
    } else {
      byCategory.set(key, [warning]);
    }
  }

  const summarized: RefinementWarning[] = [];

  for (const group of byCategory.values()) {
    if (group.length === 1) {
      summarized.push(group[0]);
      continue;
    }

    summarized.push({
      recordType: group[0].recordType,
      recordId: 'multiple',
      message: `${group[0].message} (x${String(group.length)})`,
    });
  }

  return summarized;
}
