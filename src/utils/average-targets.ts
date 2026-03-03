/**
 * Computes the series targets needed to maintain or increase a season average.
 *
 * Projects gamesPlayed forward to the next session boundary using
 * ceil((gamesPlayed + 1) / n) * n, so targets always reflect the end of the
 * current or upcoming session. This means:
 *   - Targets count down live as games are entered during a session.
 *   - Once a session is complete, targets immediately reset to the next session.
 *
 * @param gamesPlayed - Total games bowled so far this season (including any mid-session games)
 * @param totalPins   - Total pins bowled so far this season (including any mid-session games)
 * @param n           - Number of games per session
 * @returns holdTarget: remaining pins needed to maintain floor average;
 *          gainTarget: remaining pins needed to raise average by 1 pin
 */
export function computeAverageTargets(
  gamesPlayed: number,
  totalPins: number,
  n: number
): { holdTarget: number; gainTarget: number } {
  const floorAvg = Math.floor(totalPins / gamesPlayed);
  const roundedGames = Math.ceil((gamesPlayed + 1) / n) * n;
  const holdTarget = floorAvg * roundedGames - totalPins;
  const gainTarget = (floorAvg + 1) * roundedGames - totalPins;
  return { holdTarget, gainTarget };
}
