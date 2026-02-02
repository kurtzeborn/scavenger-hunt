import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

// Mock login page for local development
// Simulates the Azure Static Web Apps /.auth/login/aad flow

export function MockAuthPage() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('scott@kurtzeborn.org');
  const redirectUri = searchParams.get('post_login_redirect_uri') || '/dashboard';

  const handleLogin = () => {
    // Create a mock client principal similar to what SWA provides
    const mockPrincipal = {
      userId: crypto.randomUUID(),
      userDetails: email,
      identityProvider: 'aad',
      userRoles: ['authenticated', 'anonymous'],
    };

    // Store in localStorage for the mock auth system
    localStorage.setItem('mockAuthPrincipal', JSON.stringify(mockPrincipal));
    
    // Redirect to the requested page
    window.location.href = redirectUri;
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            🔐 Mock Sign In
          </h1>
          <p className="text-sm text-amber-600 bg-amber-50 rounded p-2">
            This is a local development mock. In production, this redirects to Microsoft Entra ID.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-gray-700 font-medium mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-3 focus:border-blue-500 focus:outline-none"
              placeholder="user@example.com"
            />
            <p className="text-xs text-gray-500 mt-1">
              Use <code className="bg-gray-100 px-1">scott@kurtzeborn.org</code> to sign in as a game keeper
            </p>
          </div>

          <button
            onClick={handleLogin}
            disabled={!email}
            className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Sign In
          </button>

          <a
            href="/"
            className="block text-center text-gray-500 hover:text-gray-700 text-sm"
          >
            Cancel
          </a>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-400 text-center">
            Redirecting to: <code>{redirectUri}</code>
          </p>
        </div>
      </div>
    </div>
  );
}

// Mock logout - clears the mock auth
export function MockLogoutPage() {
  const [searchParams] = useSearchParams();
  const redirectUri = searchParams.get('post_logout_redirect_uri') || '/';

  useEffect(() => {
    localStorage.removeItem('mockAuthPrincipal');
    window.location.href = redirectUri;
  }, [redirectUri]);

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <p className="text-gray-500">Signing out...</p>
    </div>
  );
}
