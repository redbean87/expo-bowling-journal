import { makeFunctionReference } from 'convex/server';

export type ViewerQueryResult = {
  subject: string;
  name: string | null;
  email: string | null;
} | null;

export const viewerQuery = makeFunctionReference<
  'query',
  Record<string, never>,
  ViewerQueryResult
>('users:viewer');
