export type LeagueType = 'league' | 'tournament' | 'open';

type LeagueTypeable = {
  isOpenBowling?: boolean | null;
  type?: LeagueType | null;
};

export function resolveLeagueType(league: LeagueTypeable): LeagueType {
  if (league.type) return league.type;
  if (league.isOpenBowling) return 'open';
  return 'league';
}

export function leagueTypeLabel(type: LeagueType): string {
  switch (type) {
    case 'league':
      return 'League';
    case 'tournament':
      return 'Tournament';
    case 'open':
      return 'Open Bowling';
  }
}

export function sessionLabel(
  weekNumber: number | null,
  type: LeagueType,
  formattedDate?: string
): string {
  switch (type) {
    case 'league':
      return weekNumber != null ? `Week ${weekNumber}` : 'Session';
    case 'tournament':
      return weekNumber != null ? `Round ${weekNumber}` : 'Round';
    case 'open':
      return formattedDate ?? 'Session';
  }
}
