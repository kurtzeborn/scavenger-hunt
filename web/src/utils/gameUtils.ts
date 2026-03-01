import type { Game, Scenario, Player, Difficulty } from '../types';
import type { CSSProperties } from 'react';

// Difficulty sort order for scoring playback: easy first, then medium, then hard
const DIFFICULTY_ORDER: Record<Difficulty, number> = {
  easy: 0,
  medium: 1,
  hard: 2,
};

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
 * Returns game scenarios sorted by difficulty (easy → medium → hard),
 * then by original order within the same difficulty level.
 * Used for scoring/judging playback.
 */
export function getDifficultySortedScenarios(
  game: Game,
  allScenarios: Scenario[]
): Scenario[] {
  const scenariosWithOrder = game.scenarios
    .map((ref) => ({
      scenario: allScenarios.find((s) => s.id === ref.scenarioId),
      order: ref.order,
    }))
    .filter((s): s is { scenario: Scenario; order: number } => s.scenario !== undefined);

  return scenariosWithOrder
    .sort((a, b) => {
      const diffA = DIFFICULTY_ORDER[a.scenario.difficulty || 'medium'];
      const diffB = DIFFICULTY_ORDER[b.scenario.difficulty || 'medium'];
      if (diffA !== diffB) return diffA - diffB;
      return a.order - b.order;
    })
    .map((s) => s.scenario);
}

/**
 * Get the captain (first player to join) of a team.
 * Returns the player ID of the captain, or undefined if no players.
 */
export function getCaptainId(players: Player[]): string | undefined {
  if (players.length === 0) return undefined;
  const sorted = [...players].sort(
    (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
  );
  return sorted[0].id;
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
 * Get CSS style to correct video orientation.
 * When a video was recorded with a mismatched device/stream orientation,
 * we store the device angle at capture time and apply a CSS rotation at display.
 */
export function getVideoRotationStyle(orientationAngle?: number): CSSProperties {
  if (orientationAngle === 90) {
    return { transform: 'rotate(-90deg)', transformOrigin: 'center center' };
  }
  if (orientationAngle === 270) {
    return { transform: 'rotate(90deg)', transformOrigin: 'center center' };
  }
  return {};
}

/**
 * Detect if device orientation and stream aspect ratio are mismatched.
 * Returns the device angle if a mismatch is detected, undefined otherwise.
 * Mismatch occurs when the device is in landscape but the camera stream is portrait,
 * indicating the browser isn't compensating for orientation.
 */
export function detectOrientationMismatch(
  streamWidth: number,
  streamHeight: number
): number | undefined {
  const angle = screen.orientation?.angle ?? 0;
  const isDeviceLandscape = angle === 90 || angle === 270;
  const isStreamPortrait = streamHeight > streamWidth;
  return isDeviceLandscape && isStreamPortrait ? angle : undefined;
}

export function getPositionLabel(position: number): string {
  return `${position}${getOrdinalSuffix(position)}`;
}
