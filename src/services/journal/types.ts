import type { Doc, Id } from '../../../convex/_generated/dataModel';

export type League = Doc<'leagues'>;
export type Session = Doc<'sessions'>;
export type Game = Doc<'games'>;
export type Frame = Doc<'frames'>;

export type LeagueId = Id<'leagues'>;
export type SessionId = Id<'sessions'>;
export type GameId = Id<'games'>;
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

export type UpdateGameInput = {
  gameId: GameId;
  date: string;
  ballId?: BallId | null;
  patternId?: PatternId | null;
};

export type EditableFrameInput = {
  frameNumber: number;
  roll1: number;
  roll2?: number | null;
  roll3?: number | null;
};

export type ReplaceFramesInput = {
  gameId: GameId;
  frames: EditableFrameInput[];
};
