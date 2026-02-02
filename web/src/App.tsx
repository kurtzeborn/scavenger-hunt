import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { LandingPage } from './pages/LandingPage';
import { GamePage } from './pages/GamePage';
import { DashboardPage } from './pages/DashboardPage';
import { CreateGamePage } from './pages/CreateGamePage';
import { MockAuthPage, MockLogoutPage } from './pages/MockAuthPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds
      retry: 2,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/game/:gameCode" element={<GamePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/create" element={<CreateGamePage />} />
            {/* Mock auth routes for local development */}
            <Route path="/.auth/login/aad" element={<MockAuthPage />} />
            <Route path="/.auth/logout" element={<MockLogoutPage />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
