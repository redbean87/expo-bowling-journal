import { useLocalMode } from '@/providers/app-provider';

/**
 * Local-first auth gate (C-1d).
 *
 * The sign-in era is over: the journal on this device is local, so the
 * gate no longer asks Convex for anything — no session check, no sign-in
 * form, no viewer read, no auth calls. While local mode is on (the
 * conversion switch, forced on for this phase) the gate renders nothing
 * and the app opens directly into the local journal.
 */
export function AuthGate() {
  const localMode = useLocalMode();

  // Local-first entry: the journal on this device needs no account, so
  // there is nothing to gate.
  if (localMode) {
    return null;
  }

  // The conversion switch is forced on for this phase, so there is no
  // server-mode render left for the gate to show.
  return null;
}
