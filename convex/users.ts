import { getAuthUserId } from '@convex-dev/auth/server';
import { queryGeneric } from 'convex/server';

export const viewer = queryGeneric({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = await getAuthUserId(ctx);

    if (!identity || !userId) {
      return null;
    }

    const user = await ctx.db.get(userId);

    const resolvedEmail =
      identity.email ??
      user?.email ??
      (identity.tokenIdentifier.includes('@')
        ? identity.tokenIdentifier
        : null);

    return {
      userId,
      subject: identity.subject,
      name: identity.name ?? null,
      email: resolvedEmail,
    };
  },
});
