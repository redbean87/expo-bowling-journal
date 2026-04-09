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

export function sessionLabel(formattedDate?: string): string {
  return formattedDate ?? 'Session';
}
