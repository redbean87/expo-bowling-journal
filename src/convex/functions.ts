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
type FrameDoc = Doc<'frames'>;

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

export const gamesGetByIdQuery = makeFunctionReference<
  'query',
  {
    gameId: Id<'games'>;
  },
  GameDoc
>('games:getById');

export const gamesUpdateMutation = makeFunctionReference<
  'mutation',
  {
    gameId: Id<'games'>;
    date: string;
    ballId?: Id<'balls'> | null;
    patternId?: Id<'patterns'> | null;
  },
  Id<'games'>
>('games:update');

export const framesListByGameQuery = makeFunctionReference<
  'query',
  {
    gameId: Id<'games'>;
  },
  FrameDoc[]
>('frames:listByGame');

export const framesReplaceForGameMutation = makeFunctionReference<
  'mutation',
  {
    gameId: Id<'games'>;
    frames: Array<{
      frameNumber: number;
      roll1: number;
      roll2?: number | null;
      roll3?: number | null;
    }>;
  },
  Id<'games'>
>('frames:replaceForGame');
