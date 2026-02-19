import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faCheck,
  faCamera,
  faVideo,
  faGaugeHigh,
  faGauge,
  faGaugeSimple,
} from '@fortawesome/free-solid-svg-icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { fetchScenarios, createGame } from '../api';

export function CreateGamePage() {
  const navigate = useNavigate();
  const [scenarioCount, setScenarioCount] = useState(10);
  const [timeLimit, setTimeLimit] = useState(60); // minutes
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<Set<string>>(new Set());

  const { data: scenarios, isLoading } = useQuery({
    queryKey: ['scenarios'],
    queryFn: fetchScenarios,
  });

  const createGameMutation = useMutation({
    mutationFn: createGame,
    onSuccess: (data) => {
      navigate(`/game/${data.id}`);
    },
  });

  const categories = scenarios
    ? ['all', ...new Set(scenarios.map((s) => s.category))]
    : ['all'];

  const filteredScenarios = scenarios?.filter(
    (s) => selectedCategory === 'all' || s.category === selectedCategory
  );

  const toggleScenario = (id: string) => {
    const newSelected = new Set(selectedScenarioIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else if (newSelected.size < scenarioCount) {
      newSelected.add(id);
    }
    setSelectedScenarioIds(newSelected);
  };

  const handleCreate = () => {
    if (selectedScenarioIds.size !== scenarioCount) {
      alert(`Please select exactly ${scenarioCount} scenarios`);
      return;
    }

    createGameMutation.mutate({
      config: {
        scenarioCount,
        timeLimit,
        timeLimitPerScenario: timeLimit / scenarioCount,
      },
      scenarioIds: Array.from(selectedScenarioIds),
    });
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-gray-500 hover:text-gray-700"
          >
            <FontAwesomeIcon icon={faArrowLeft} />
          </button>
          <h1 className="text-xl font-bold text-gray-800">Create New Game</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Game Settings */}
        <section className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Game Settings</h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-gray-700 font-medium mb-2">
                Number of Scenarios
              </label>
              <input
                type="number"
                value={scenarioCount}
                onChange={(e) => {
                  const value = Math.max(5, Math.min(20, Number(e.target.value)));
                  setScenarioCount(value);
                  setSelectedScenarioIds(new Set()); // Reset selection
                }}
                min={5}
                max={20}
                className="w-full border border-gray-300 rounded-lg p-3 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-medium mb-2">
                Time Limit (minutes)
              </label>
              <input
                type="number"
                value={timeLimit}
                onChange={(e) => setTimeLimit(Number(e.target.value))}
                min={10}
                max={180}
                className="w-full border border-gray-300 rounded-lg p-3 focus:border-blue-500 focus:outline-none"
              />
              <p className="text-sm text-gray-500 mt-1">
                ~{Math.round(timeLimit / scenarioCount)} min per scenario
              </p>
            </div>
          </div>
        </section>

        {/* Scenario Selection */}
        <section className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800">
              Select Scenarios ({selectedScenarioIds.size}/{scenarioCount})
            </h2>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'all' ? 'All Categories' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {isLoading ? (
            <p className="text-gray-500">Loading scenarios...</p>
          ) : (
            <div className="grid gap-1 max-h-96 overflow-y-auto">
              {filteredScenarios?.map((scenario) => {
                const isSelected = selectedScenarioIds.has(scenario.id);
                const isDisabled = !isSelected && selectedScenarioIds.size >= scenarioCount;

                return (
                  <div
                    key={scenario.id}
                    onClick={() => !isDisabled && toggleScenario(scenario.id)}
                    className={`px-2 py-1.5 rounded border cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : isDisabled
                        ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                        : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <FontAwesomeIcon
                        icon={scenario.mediaType === 'photo' ? faCamera : faVideo}
                        className={`w-4 flex-shrink-0 ${scenario.mediaType === 'photo' ? 'text-amber-500' : 'text-red-500'}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="font-medium text-gray-800">{scenario.title}</span>
                          <span className="text-sm text-gray-500">{scenario.description}</span>
                        </div>
                      </div>
                      <FontAwesomeIcon
                        icon={scenario.difficulty === 'hard' ? faGaugeHigh : scenario.difficulty === 'medium' ? faGauge : faGaugeSimple}
                        className={`flex-shrink-0 text-sm ${
                          scenario.difficulty === 'hard'
                            ? 'text-red-500'
                            : scenario.difficulty === 'medium'
                            ? 'text-yellow-500'
                            : 'text-green-500'
                        }`}
                        title={scenario.difficulty}
                      />
                      <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded flex-shrink-0">
                        {scenario.category}
                      </span>
                      {isSelected && (
                        <FontAwesomeIcon icon={faCheck} className="text-blue-500 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Create Button */}
        <button
          onClick={handleCreate}
          disabled={selectedScenarioIds.size !== scenarioCount || createGameMutation.isPending}
          className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-lg transition-colors text-lg"
        >
          {createGameMutation.isPending ? 'Creating...' : 'Create Game'}
        </button>

        {createGameMutation.isError && (
          <p className="text-red-500 text-center mt-4">
            Failed to create game. Please try again.
          </p>
        )}
      </main>
    </div>
  );
}
