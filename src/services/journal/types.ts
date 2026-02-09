import type { Doc, Id } from '../../../convex/_generated/dataModel';

export type League = Doc<'leagues'>;
export type Session = Doc<'sessions'>;
export type Game = Doc<'games'>;

export type LeagueId = Id<'leagues'>;
export type SessionId = Id<'sessions'>;
export type BallId = Id<'balls'>;
export type PatternId = Id<'patterns'>;

export type CreateLeagueInput = {
  name: string;
  houseId?: Id<'houses'> | null;
  houseName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

export type CreateSessionInput = {
  leagueId: LeagueId;
  weekNumber?: number | null;
  date: string;
};

export type CreateGameInput = {
  sessionId: SessionId;
  date: string;
  ballId?: BallId | null;
  patternId?: PatternId | null;
};
