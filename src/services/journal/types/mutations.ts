import type {
  BallId,
  EditableFrameInput,
  GameId,
  LeagueId,
  PatternId,
  SessionId,
} from './core';
import type { Id } from '../../../../convex/_generated/dataModel';

export type CreateLeagueInput = {
  name: string;
  clientSyncId?: string | null;
  gamesPerSession?: number | null;
  houseId?: Id<'houses'> | null;
  houseName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

export type UpdateLeagueInput = {
  leagueId: LeagueId;
  name: string;
  gamesPerSession?: number | null;
  houseId?: Id<'houses'> | null;
};

export type RemoveLeagueInput = {
  leagueId: LeagueId;
};

export type CreateSessionInput = {
  leagueId: LeagueId;
  clientSyncId?: string | null;
  weekNumber?: number | null;
  date: string;
  houseId?: Id<'houses'> | null;
  ballId?: BallId | null;
  patternId?: PatternId | null;
};

export type UpdateSessionInput = {
  sessionId: SessionId;
  weekNumber?: number | null;
  date: string;
  houseId?: Id<'houses'> | null;
  ballId?: BallId | null;
  patternId?: PatternId | null;
};

export type RemoveSessionInput = {
  sessionId: SessionId;
};

export type CreateGameInput = {
  sessionId: SessionId;
  date: string;
  clientSyncId?: string | null;
  ballId?: BallId | null;
  patternId?: PatternId | null;
};

export type RemoveGameInput = {
  gameId: GameId;
};

export type UpdateGameInput = {
  gameId: GameId;
  date: string;
  ballId?: BallId | null;
  patternId?: PatternId | null;
};

export type ReplaceFramesInput = {
  gameId: GameId;
  frames: EditableFrameInput[];
};

export type CreateBallInput = {
  name: string;
};

export type CreatePatternInput = {
  name: string;
};

export type CreateHouseInput = {
  name: string;
};
