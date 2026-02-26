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
};

export type GameListItem = Game & {
  framePreview?: FramePreviewItem[];
};

export type LeagueId = Id<'leagues'>;
export type SessionId = Id<'sessions'>;
export type GameId = Id<'games'>;
export type BallId = Id<'balls'>;
export type PatternId = Id<'patterns'>;

export type EditableFrameInput = {
  frameNumber: number;
  roll1: number;
  roll2?: number | null;
  roll3?: number | null;
  pins?: number | null;
};
