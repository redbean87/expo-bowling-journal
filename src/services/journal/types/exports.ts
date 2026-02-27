export type SqliteBackupSnapshot = {
  sourceFileName: string | null;
  sourceHash: string | null;
  houses: Array<{
    sqliteId: number;
    name?: string | null;
    sortOrder?: number | null;
    flags?: number | null;
    location?: string | null;
  }>;
  patterns: Array<{
    sqliteId: number;
    name?: string | null;
    sortOrder?: number | null;
    flags?: number | null;
    length?: number | null;
  }>;
  balls: Array<{
    sqliteId: number;
    name?: string | null;
    sortOrder?: number | null;
    flags?: number | null;
    brand?: string | null;
    coverstock?: string | null;
  }>;
  leagues: Array<{
    sqliteId: number;
    ballFk?: number | null;
    patternFk?: number | null;
    houseFk?: number | null;
    name?: string | null;
    games?: number | null;
    notes?: string | null;
    sortOrder?: number | null;
    flags?: number | null;
  }>;
  weeks: Array<{
    sqliteId: number;
    leagueFk?: number | null;
    ballFk?: number | null;
    patternFk?: number | null;
    houseFk?: number | null;
    date?: number | string | null;
    notes?: string | null;
    lane?: number | null;
  }>;
  games: Array<{
    sqliteId: number;
    weekFk?: number | null;
    leagueFk?: number | null;
    ballFk?: number | null;
    patternFk?: number | null;
    houseFk?: number | null;
    score?: number | null;
    frame?: number | null;
    flags?: number | null;
    singlePinSpareScore?: number | null;
    notes?: string | null;
    lane?: number | null;
    date?: number | string | null;
  }>;
  frames: Array<{
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
  }>;
  bjMeta: Array<{
    key: string;
    value: string;
  }>;
  bjSessionExt: Array<{
    weekFk: number;
    laneContextJson?: string | null;
    notesJson?: string | null;
  }>;
  bjGameExt: Array<{
    gameFk: number;
    laneContextJson?: string | null;
    ballSwitchesJson?: string | null;
    handicap?: number | null;
    notesJson?: string | null;
  }>;
};
