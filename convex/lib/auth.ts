import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';

import type { Auth } from 'convex/server';

export async function requireUserId(ctx: { auth: Auth }) {
  const userId = await getAuthUserId(ctx);

  if (!userId) {
    throw new ConvexError('Unauthorized');
  }

  return userId;
}
