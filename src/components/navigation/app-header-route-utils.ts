import { getFirstParam } from '@/utils/route-params';

export function resolveUpTarget({
  routeName,
  params,
}: {
  routeName: string;
  params: unknown;
}): string | null {
  const routeParams =
    params !== null && typeof params === 'object'
      ? (params as Record<string, unknown>)
      : null;
  const leagueId = getFirstParam(routeParams?.leagueId);
  const sessionId = getFirstParam(routeParams?.sessionId);

  if (routeName === '[leagueId]/sessions/[sessionId]/games/[gameId]') {
    if (leagueId && sessionId) {
      return `/journal/${leagueId}/sessions/${sessionId}/games`;
    }

    return '/journal';
  }

  if (routeName === '[leagueId]/sessions/[sessionId]/games/index') {
    if (leagueId) {
      return `/journal/${leagueId}/sessions`;
    }

    return '/journal';
  }

  if (routeName === '[leagueId]/sessions/index') {
    return '/journal';
  }

  return null;
}
