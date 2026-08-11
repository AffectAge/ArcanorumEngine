import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './state/auth-store.js';
import { GameShellPage } from './features/game/GameShellPage.js';
import { LoginPage } from './features/auth/LoginPage.js';
import { RegisterPage } from './features/auth/RegisterPage.js';

export function App() {
  const status = useAuthStore((state) => state.status);
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  if (status === 'loading') {
    return <main className="app-loading" aria-live="polite" />;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={status === 'authenticated' ? <Navigate to="/game" replace /> : <LoginPage />}
      />
      <Route
        path="/register"
        element={status === 'authenticated' ? <Navigate to="/game" replace /> : <RegisterPage />}
      />
      <Route
        path="/game"
        element={status === 'authenticated' ? <GameShellPage /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to={status === 'authenticated' ? '/game' : '/login'} replace />} />
    </Routes>
  );
}
