import { makeFunctionReference } from 'convex/server';

import type { Doc, Id } from '../../convex/_generated/dataModel';

export type ViewerQueryResult = {
  subject: string;
  name: string | null;
  email: string | null;
} | null;

type LeagueDoc = Doc<'leagues'>;
type SessionDoc = Doc<'sessions'>;
type GameDoc = Doc<'games'>;

export const viewerQuery = makeFunctionReference<
  'query',
  Record<string, never>,
  ViewerQueryResult
>('users:viewer');

export const leaguesListQuery = makeFunctionReference<
  'query',
  Record<string, never>,
  LeagueDoc[]
>('leagues:list');

export const leaguesCreateMutation = makeFunctionReference<
  'mutation',
  {
    name: string;
    houseId?: Id<'houses'> | null;
    houseName?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  },
  Id<'leagues'>
>('leagues:create');

export const sessionsListByLeagueQuery = makeFunctionReference<
  'query',
  {
    leagueId: Id<'leagues'>;
  },
  SessionDoc[]
>('sessions:listByLeague');

export const sessionsCreateMutation = makeFunctionReference<
  'mutation',
  {
    leagueId: Id<'leagues'>;
    weekNumber?: number | null;
    date: string;
  },
  Id<'sessions'>
>('sessions:create');

export const gamesListBySessionQuery = makeFunctionReference<
  'query',
  {
    sessionId: Id<'sessions'>;
  },
  GameDoc[]
>('games:listBySession');

export const gamesCreateMutation = makeFunctionReference<
  'mutation',
  {
    sessionId: Id<'sessions'>;
    date: string;
    ballId?: Id<'balls'> | null;
    patternId?: Id<'patterns'> | null;
  },
  Id<'games'>
>('games:create');
