import type { Game, Scenario } from '../types';

/**
 * Given a game and all available scenarios, returns the game's scenarios
 * in the correct order with full scenario data.
 */
export function getOrderedGameScenarios(
  game: Game,
  allScenarios: Scenario[]
): Scenario[] {
  return game.scenarios
    .sort((a, b) => a.order - b.order)
    .map((ref) => allScenarios.find((s) => s.id === ref.scenarioId))
    .filter((s): s is Scenario => s !== undefined);
}

/**
 * Format time remaining in MM:SS format.
 */
export function formatTimeRemaining(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Get ordinal suffix for a number (1st, 2nd, 3rd, etc.)
 */
export function getOrdinalSuffix(n: number): string {
  const suffixes: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };
  return suffixes[n] || 'th';
}

/**
 * Get position label (1st, 2nd, 3rd, etc.)
 */
export function getPositionLabel(position: number): string {
  return `${position}${getOrdinalSuffix(position)}`;
}
