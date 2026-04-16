import { useEffect, useState } from 'react';
import { sessionsApi } from '../api';

export default function History() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await sessionsApi.list();
        setSessions(response.data);
      } catch (requestError) {
        setError(requestError.response?.data?.error || 'Nepavyko gauti sesiju');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <main className="layout-wide">
      <h1>Pazangos istorija</h1>
      {loading ? <div className="panel">Kraunama...</div> : null}
      {error ? <div className="error">{error}</div> : null}

      {!loading && sessions.length === 0 ? <div className="panel">Atliktu treniruociu dar nera.</div> : null}

      <section className="stack">
        {sessions.map((session) => (
          <article key={session.id} className="panel">
            <h3>{session.plan_name || 'Laisva treniruote'}</h3>
            <p className="meta">
              Pradzia: {new Date(session.started_at).toLocaleString('lt-LT')} | Pabaiga:{' '}
              {session.finished_at ? new Date(session.finished_at).toLocaleString('lt-LT') : 'vyksta'}
            </p>
            <p>
              Setai: {session.total_sets ?? '-'} | Pakartojimai: {session.total_reps ?? '-'}
            </p>
            <p>{session.notes || 'Pastabu nera.'}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
