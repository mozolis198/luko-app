import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import Login from './pages/Login';
import Library from './pages/Library';
import Planner from './pages/Planner';
import History from './pages/History';
import { useAuthStore } from './store/auth';

function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function AppShell({ children }) {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h2>WorkoutApp</h2>
          <p className="meta">Sveikas, {user?.name || user?.email}</p>
        </div>
        <nav className="nav">
          <NavLink to="/library">Biblioteka</NavLink>
          <NavLink to="/planner">Planai</NavLink>
          <NavLink to="/history">Istorija</NavLink>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            Atsijungti
          </button>
        </nav>
      </header>
      {children}
    </div>
  );
}

export default function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/library" replace /> : <Login />} />
      <Route
        path="/library"
        element={
          <ProtectedRoute>
            <AppShell>
              <Library />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/planner"
        element={
          <ProtectedRoute>
            <AppShell>
              <Planner />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/history"
        element={
          <ProtectedRoute>
            <AppShell>
              <History />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to={isAuthenticated ? '/library' : '/login'} replace />} />
    </Routes>
  );
}
