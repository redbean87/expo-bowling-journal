import type { Doc, Id } from '../../../../convex/_generated/dataModel';

export type League = Doc<'leagues'>;
export type Session = Doc<'sessions'>;
export type Game = Doc<'games'>;
export type Ball = Doc<'balls'>;
export type Pattern = Doc<'patterns'>;
export type House = Doc<'houses'>;
export type Frame = Doc<'frames'>;

export type FramePreviewItem = {
  text: string;
  hasSplit: boolean;
  isOpen: boolean;
};

export type GameListItem = Game & {
  framePreview?: FramePreviewItem[];
};

export type LeagueId = Id<'leagues'>;
export type SessionId = Id<'sessions'>;
export type GameId = Id<'games'>;
export type BallId = Id<'balls'>;
export type PatternId = Id<'patterns'>;

// Lean projection returned by listStatsByLeague — only the fields needed for
// session/season stat computations. Omits framePreview, ballSwitches,
// laneContext, notes, and other large fields that are dead weight on the
// league-wide live subscription.
export type LeagueGameStat = {
  _id: Id<'games'>;
  sessionId: Id<'sessions'>;
  totalScore: number | undefined;
  strikes: number | undefined;
  spares: number | undefined;
  opens: number | undefined;
};

export type EditableFrameInput = {
  frameNumber: number;
  roll1: number;
  roll2?: number | null;
  roll3?: number | null;
  pins?: number | null;
};
