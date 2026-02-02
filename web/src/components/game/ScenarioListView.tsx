import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCamera,
  faVideo,
  faCheck,
  faClock,
  faPlay,
  faTrophy,
} from '@fortawesome/free-solid-svg-icons';
import { useQuery } from '@tanstack/react-query';
import { fetchTeams, fetchScenarios } from '../../api';
import { usePlayerSession } from '../../contexts/PlayerSessionContext';
import type { Game, Scenario } from '../../types';
import { MediaCapture } from './MediaCapture';

interface ScenarioListViewProps {
  game: Game;
  isGameKeeper: boolean;
}

export function ScenarioListView({ game, isGameKeeper }: ScenarioListViewProps) {
  const { session } = usePlayerSession();
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);

  // Fetch teams for completion status
  const { data: teams = [] } = useQuery({
    queryKey: ['teams', game.id],
    queryFn: () => fetchTeams(game.id),
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Fetch all scenarios to match with game's scenario refs
  const { data: allScenarios = [] } = useQuery({
    queryKey: ['scenarios'],
    queryFn: fetchScenarios,
  });

  // Get scenarios for this game in order
  const gameScenarios = game.scenarios
    .sort((a, b) => a.order - b.order)
    .map((ref) => allScenarios.find((s) => s.id === ref.scenarioId))
    .filter((s): s is Scenario => s !== undefined);

  // Find current player's team
  const myTeam = teams.find((t) => t.id === session?.teamId);
  const completedScenarios = myTeam?.completedScenarios || [];

  // Calculate time remaining
  const endsAt = game.endsAt ? new Date(game.endsAt) : null;
  const now = new Date();
  const timeRemaining = endsAt ? Math.max(0, endsAt.getTime() - now.getTime()) : 0;
  const minutesRemaining = Math.floor(timeRemaining / 60000);
  const secondsRemaining = Math.floor((timeRemaining % 60000) / 1000);

  // Calculate score
  const myScore = completedScenarios.length;
  const totalScenarios = game.config.scenarioCount;

  // If a scenario is selected, show the capture view
  if (selectedScenario) {
    return (
      <MediaCapture
        game={game}
        scenario={selectedScenario}
        onComplete={() => setSelectedScenario(null)}
        onCancel={() => setSelectedScenario(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header with Timer */}
      <header className="bg-gradient-to-r from-blue-600 to-purple-700 text-white shadow-lg sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Left: Player info or Game Keeper label */}
            {isGameKeeper ? (
              <div>
                <p className="text-blue-100 text-sm">Game Keeper</p>
                <p className="font-semibold">Monitoring</p>
              </div>
            ) : (
              <div>
                <p className="text-blue-100 text-sm">{myTeam?.name}</p>
                <p className="font-semibold">{session?.displayName}</p>
              </div>
            )}
            
            {/* Center: Timer */}
            <div className="text-center">
              <div className="flex items-center gap-2 text-2xl font-mono font-bold">
                <FontAwesomeIcon icon={faClock} className="text-yellow-300" />
                {minutesRemaining.toString().padStart(2, '0')}:
                {secondsRemaining.toString().padStart(2, '0')}
              </div>
              <p className="text-blue-100 text-xs">Time Remaining</p>
            </div>

            {/* Right: Score (only for players) */}
            {!isGameKeeper ? (
              <div className="text-right">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faTrophy} className="text-yellow-300" />
                  <span className="text-2xl font-bold">{myScore}/{totalScenarios}</span>
                </div>
                <p className="text-blue-100 text-xs">Completed</p>
              </div>
            ) : (
              <div className="text-right">
                <p className="text-2xl font-bold">{teams.length}</p>
                <p className="text-blue-100 text-xs">Teams</p>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Scoreboard (collapsed) - horizontal scroll for many teams */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-2">
          <div className="flex items-center gap-3 overflow-x-auto flex-nowrap pb-1">
            {teams
              .sort((a, b) => b.completedScenarios.length - a.completedScenarios.length)
              .map((team) => (
                <div
                  key={team.id}
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full whitespace-nowrap text-sm ${
                    team.id === myTeam?.id ? 'bg-blue-100' : 'bg-gray-100'
                  }`}
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: team.color }}
                  />
                  <span className="font-medium text-sm">{team.name}</span>
                  <span className="text-gray-500 text-sm">{team.completedScenarios.length}</span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Scenarios List */}
      <main className="max-w-4xl mx-auto px-4 py-4">
        <div className="grid gap-2">
          {gameScenarios.map((scenario, index) => {
            const isCompleted = completedScenarios.includes(scenario.id);
            const scenarioRef = game.scenarios.find((s) => s.scenarioId === scenario.id);
            // Count how many teams have completed this scenario
            const teamsCompleted = teams.filter(t => t.completedScenarios.includes(scenario.id)).length;
            
            return (
              <div
                key={scenario.id}
                className={`bg-white rounded-lg shadow overflow-hidden transition-all ${
                  isCompleted ? 'opacity-75' : 'hover:shadow-md'
                }`}
              >
                <div className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    {/* Scenario Number */}
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                        isCompleted
                          ? 'bg-green-100 text-green-600'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {isCompleted ? (
                        <FontAwesomeIcon icon={faCheck} />
                      ) : (
                        scenarioRef?.order || index + 1
                      )}
                    </div>

                    {/* Scenario Details - inline layout */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <FontAwesomeIcon
                          icon={scenario.mediaType === 'video' ? faVideo : faCamera}
                          className={`text-xs ${scenario.mediaType === 'video' ? 'text-red-500' : 'text-blue-500'}`}
                        />
                        <h3 className="font-semibold text-gray-800">{scenario.title}</h3>
                        <span className="text-gray-500 text-sm">{scenario.description}</span>
                      </div>
                    </div>

                    {/* Teams completed count (for gamekeeper) or action button (for players) */}
                    {isGameKeeper ? (
                      <div className="flex-shrink-0 text-center min-w-[3rem]">
                        <span className={`text-sm font-medium ${teamsCompleted > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                          {teamsCompleted}/{teams.length}
                        </span>
                      </div>
                    ) : isCompleted ? (
                      <div className="flex-shrink-0 bg-green-100 text-green-700 font-medium py-1.5 px-3 rounded-lg flex items-center gap-1.5 text-sm">
                        <FontAwesomeIcon icon={faCheck} />
                        <span className="hidden sm:inline">Done</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => setSelectedScenario(scenario)}
                        className="flex-shrink-0 bg-blue-500 hover:bg-blue-600 text-white font-medium py-1.5 px-3 rounded-lg transition-colors flex items-center gap-1.5 text-sm"
                      >
                        <FontAwesomeIcon icon={faPlay} />
                        <span className="hidden sm:inline">Capture</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Completion Message (players only) */}
        {!isGameKeeper && myScore === totalScenarios && (
          <div className="mt-8 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl p-6 text-center text-white">
            <FontAwesomeIcon icon={faTrophy} className="text-5xl mb-4" />
            <h2 className="text-2xl font-bold mb-2">🎉 All Scenarios Complete!</h2>
            <p className="text-green-100">
              Amazing work! Wait for the game to end to see the final results.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
