// Shared `registerHooks` remap helper for the three offline test suites
// (`tests/providers/game-save-queue-syncer.test.ts`,
// `tests/hooks/journal-hooks-offline.test.ts`, and
// `tests/hooks/import-backup-offline.test.ts`), extracted from the
// syncer suite's private copy.
//
// Each suite remaps a different set of specifiers to its own stub
// module, so the per-suite rewrite tables stay in the suite. This
// helper owns only the registration and pass-through mechanics all
// three copies share: `tableFor` selects the effective rewrite table
// for the importing module (`context.parentURL`), a mapped specifier
// is resolved to the stub, and everything else is handed to the next
// resolver unchanged. The suite deregisters the returned handle from
// its own `after` hook.

import { registerHooks, type ModuleHooks } from 'node:module';

export function registerStubRemaps(
  tableFor: (parentURL: string | undefined) => Record<string, string>
): ModuleHooks {
  return registerHooks({
    resolve(specifier, context, nextResolve) {
      const rewritten = tableFor(context.parentURL)[specifier];

      if (rewritten) {
        return nextResolve(rewritten, context);
      }

      return nextResolve(specifier, context);
    },
  });
}
