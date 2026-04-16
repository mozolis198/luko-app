import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api';
import { useAuthStore } from '../store/auth';

export default function Login() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onChange = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const onSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload = isRegister
        ? { email: form.email, password: form.password, name: form.name }
        : { email: form.email, password: form.password };

      const response = isRegister ? await authApi.register(payload) : await authApi.login(payload);
      setAuth(response.data);
      navigate('/library');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Nepavyko prisijungti');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="layout-center">
      <form className="panel auth-panel" onSubmit={onSubmit}>
        <h1>{isRegister ? 'Sukurti paskyra' : 'Prisijungti'}</h1>
        <p className="meta">WorkoutApp - treniruociu planavimas vienoje vietoje.</p>

        {isRegister ? (
          <label>
            Vardas
            <input value={form.name} onChange={(e) => onChange('name', e.target.value)} />
          </label>
        ) : null}

        <label>
          El. pastas
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => onChange('email', e.target.value)}
          />
        </label>

        <label>
          Slaptazodis
          <input
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => onChange('password', e.target.value)}
          />
        </label>

        {error ? <div className="error">{error}</div> : null}

        <button className="btn" type="submit" disabled={loading}>
          {loading ? 'Vyksta...' : isRegister ? 'Registruotis' : 'Prisijungti'}
        </button>

        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            setIsRegister((prev) => !prev);
            setError('');
          }}
        >
          {isRegister ? 'Turiu paskyra' : 'Kurti nauja paskyra'}
        </button>
      </form>
    </main>
  );
}
