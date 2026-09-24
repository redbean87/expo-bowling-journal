import { internalQuery } from './_generated/server';

export const pingDatabase = internalQuery({
  args: {},
  handler: async (ctx) => {
    await ctx.db.query('leagues').take(1);

    return null;
  },
});
