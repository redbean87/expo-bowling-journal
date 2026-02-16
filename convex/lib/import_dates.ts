export type SqliteDateInput = number | string | null | undefined;

export type SqliteWeekLike = {
  leagueFk?: number | null;
  date?: SqliteDateInput;
};

const MIN_TZ_OFFSET_MINUTES = -840;
const MAX_TZ_OFFSET_MINUTES = 840;

export function normalizeTimezoneOffsetMinutes(
  value: number | null | undefined
): number | null {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return null;
  }

  const minutes = Math.trunc(value);

  if (minutes < MIN_TZ_OFFSET_MINUTES || minutes > MAX_TZ_OFFSET_MINUTES) {
    return null;
  }

  return minutes;
}

export function normalizeImportDateStrict(
  value: SqliteDateInput,
  timezoneOffsetMinutes?: number | null
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (trimmed.length < 10) {
      return null;
    }

    return trimmed.slice(0, 10);
  }

  let timestampMs = value;

  if (Math.abs(value) < 10_000_000_000) {
    timestampMs = value * 1000;
  }

  const offsetMinutes = normalizeTimezoneOffsetMinutes(timezoneOffsetMinutes);
  const shiftedTimestampMs =
    offsetMinutes === null ? timestampMs : timestampMs - offsetMinutes * 60_000;
  const parsed = new Date(shiftedTimestampMs);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

export function dateStringToUtcTimestamp(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

export function buildLeagueCreatedAtByEarliestWeekDate(
  weeks: SqliteWeekLike[],
  timezoneOffsetMinutes?: number | null
): Map<number, number> {
  const createdAtByLeague = new Map<number, number>();

  for (const week of weeks) {
    if (!week.leagueFk) {
      continue;
    }

    const normalizedDate = normalizeImportDateStrict(
      week.date,
      timezoneOffsetMinutes
    );

    if (!normalizedDate) {
      continue;
    }

    const createdAt = dateStringToUtcTimestamp(normalizedDate);
    const existing = createdAtByLeague.get(week.leagueFk);

    if (existing === undefined || createdAt < existing) {
      createdAtByLeague.set(week.leagueFk, createdAt);
    }
  }

  return createdAtByLeague;
}
