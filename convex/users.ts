import { queryGeneric } from 'convex/server';
import { getAuthUserId } from '@convex-dev/auth/server';

export const viewer = queryGeneric({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = await getAuthUserId(ctx);

    if (!identity || !userId) {
      return null;
    }

    return {
      userId,
      subject: identity.subject,
      name: identity.name ?? null,
      email: identity.email ?? null,
    };
  },
});
