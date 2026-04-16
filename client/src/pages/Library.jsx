import { useEffect, useMemo, useState } from 'react';
import { exercisesApi, plansApi, videosApi, resolveVideoUrl } from '../api';
import FilterBar from '../components/FilterBar';
import ExerciseCard from '../components/ExerciseCard';
import { isYouTubeUrl } from '../utils/video';

const initialFilters = {
  type: '',
  difficulty: '',
  muscle_group: '',
  equipment: '',
  bench_focus: false,
};

const bodyPartFilters = [
  { key: 'all', label: 'Visi pratimai', keywords: [] },
  { key: 'shoulders', label: 'Peciai', keywords: ['shoulder', 'deltoid', 'rotator', 'scap'] },
  { key: 'back', label: 'Nugara', keywords: ['back', 'lat', 'lats', 'trap', 'row'] },
  { key: 'chest', label: 'Krutine', keywords: ['chest', 'pec'] },
  { key: 'core', label: 'Core', keywords: ['core', 'abs', 'oblique', 'plank', 'crunch', 'v-up', 'twist'] },
  { key: 'hips', label: 'Klubai ir sedmenys', keywords: ['hip', 'glute', 'adductor', 'abductor', 'figure-4'] },
  { key: 'legs', label: 'Kojos', keywords: ['leg', 'quad', 'hamstring', 'squat', 'lunge', 'jump', 'plyo', 'bound'] },
  { key: 'ankles', label: 'Kulksnys ir blauzdos', keywords: ['ankle', 'calf', 'achilles', 'hop', 'pogo'] },
];

function matchesBodyPart(exercise, selectedBodyPart) {
  if (selectedBodyPart === 'all') {
    return true;
  }

  const selectedFilter = bodyPartFilters.find((item) => item.key === selectedBodyPart);
  if (!selectedFilter) {
    return true;
  }

  const haystack = `${exercise.name || ''} ${exercise.description || ''} ${exercise.muscle_group || ''}`.toLowerCase();
  return selectedFilter.keywords.some((keyword) => haystack.includes(keyword));
}

export default function Library() {
  const [exercises, setExercises] = useState([]);
  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [addingPlanExerciseId, setAddingPlanExerciseId] = useState('');
  const [plansLoading, setPlansLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedBodyPart, setSelectedBodyPart] = useState('all');
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [uploadStateByExercise, setUploadStateByExercise] = useState({});
  const [newExerciseVideoFile, setNewExerciseVideoFile] = useState(null);
  const [newExerciseUploadProgress, setNewExerciseUploadProgress] = useState(0);
  const [filters, setFilters] = useState(initialFilters);
  const [form, setForm] = useState({
    name: '',
    description: '',
    type: 'jega',
    difficulty: 'pradedantis',
    muscle_group: '',
    equipment: '',
    bench_focus: false,
  });
  const planListSize = Math.max(3, Math.min(plans.length || 1, 10));

  const queryFilters = useMemo(() => {
    const payload = {};
    Object.entries(filters).forEach(([key, value]) => {
      if (typeof value === 'boolean') {
        if (value) payload[key] = true;
      } else if (value) {
        payload[key] = value;
      }
    });
    return payload;
  }, [filters]);

  const loadExercises = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await exercisesApi.list(queryFilters);
      setExercises(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Nepavyko gauti pratimu');
    } finally {
      setLoading(false);
    }
  };

  const loadPlans = async () => {
    setPlansLoading(true);
    try {
      const response = await plansApi.list();
      setPlans(response.data);
      setSelectedPlanId((previousPlanId) => {
        if (response.data.length === 0) {
          return '';
        }

        const hasPrevious = response.data.some((plan) => String(plan.id) === String(previousPlanId));
        return hasPrevious ? String(previousPlanId) : String(response.data[0].id);
      });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Nepavyko gauti planu');
    } finally {
      setPlansLoading(false);
    }
  };

  useEffect(() => {
    loadExercises();
  }, [queryFilters]);

  useEffect(() => {
    loadPlans();
  }, []);

  useEffect(() => {
    const reloadOnFocus = () => {
      loadPlans();
    };

    window.addEventListener('focus', reloadOnFocus);
    return () => window.removeEventListener('focus', reloadOnFocus);
  }, []);

  const filteredExercises = useMemo(() => {
    const query = exerciseSearch.trim().toLowerCase();
    const withRank = exercises
      .filter((exercise) => {
        if (!matchesBodyPart(exercise, selectedBodyPart)) {
          return false;
        }

        if (!query) {
          return true;
        }

        const haystack = `${exercise.name || ''} ${exercise.description || ''} ${exercise.muscle_group || ''} ${exercise.type || ''} ${exercise.equipment || ''}`.toLowerCase();
        return haystack.includes(query);
      })
      .map((exercise, index) => {
        const resolvedVideo = resolveVideoUrl(exercise.video_path);
        return {
          exercise,
          index,
          isYouTube: isYouTubeUrl(resolvedVideo),
        };
      });

    withRank.sort((a, b) => {
      if (a.isYouTube !== b.isYouTube) {
        return a.isYouTube ? -1 : 1;
      }
      return a.index - b.index;
    });

    return withRank.map((item) => item.exercise);
  }, [exercises, selectedBodyPart, exerciseSearch]);

  const bodyPartCounts = useMemo(
    () =>
      bodyPartFilters.reduce((acc, filter) => {
        acc[filter.key] =
          filter.key === 'all' ? exercises.length : exercises.filter((exercise) => matchesBodyPart(exercise, filter.key)).length;
        return acc;
      }, {}),
    [exercises]
  );

  const onCreate = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const createdExercise = await exercisesApi.create(form);

      if (newExerciseVideoFile && createdExercise?.data?.id) {
        await videosApi.upload({
          file: newExerciseVideoFile,
          exerciseId: createdExercise.data.id,
          onProgress: (progressEvent) => {
            const total = progressEvent.total || newExerciseVideoFile.size || 0;
            const loaded = progressEvent.loaded || 0;
            const progress = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
            setNewExerciseUploadProgress(progress);
          },
        });
      }

      setForm({
        name: '',
        description: '',
        type: 'jega',
        difficulty: 'pradedantis',
        muscle_group: '',
        equipment: '',
        bench_focus: false,
      });
      setNewExerciseVideoFile(null);
      setNewExerciseUploadProgress(0);
      await loadExercises();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Nepavyko sukurti pratimo');
    }
  };

  const handleUpload = async (exerciseId, file) => {
    setError('');
    setMessage('');
    const previewUrl = URL.createObjectURL(file);

    setUploadStateByExercise((prev) => ({
      ...prev,
      [exerciseId]: { uploading: true, progress: 0, previewUrl },
    }));

    try {
      await videosApi.upload({
        file,
        exerciseId,
        onProgress: (progressEvent) => {
          const total = progressEvent.total || file.size || 0;
          const loaded = progressEvent.loaded || 0;
          const progress = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;

          setUploadStateByExercise((prev) => ({
            ...prev,
            [exerciseId]: {
              ...(prev[exerciseId] || {}),
              uploading: true,
              progress,
              previewUrl,
            },
          }));
        },
      });

      await loadExercises();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Nepavyko ikelti video');
    } finally {
      URL.revokeObjectURL(previewUrl);
      setUploadStateByExercise((prev) => {
        const next = { ...prev };
        delete next[exerciseId];
        return next;
      });
    }
  };

  const handleAddToPlan = async (exercise) => {
    setError('');
    setMessage('');

    if (!selectedPlanId) {
      setError('Pirma susikurk plana skiltyje "Planai", tada galesi prideti pratimus is bibliotekos.');
      return;
    }

    const targetPlan = plans.find((plan) => String(plan.id) === String(selectedPlanId));
    if (!targetPlan) {
      setError('Pasirinktas planas nerastas.');
      return;
    }

    const existingItems = (targetPlan.exercises || []).map((item) => ({
      exercise_id: item.exercise_id,
      sets: item.sets ?? null,
      reps: item.reps ?? null,
      weight_kg: item.weight_kg ?? null,
      duration_sec: item.duration_sec ?? null,
      rest_sec: item.rest_sec ?? null,
    }));

    const payload = {
      name: targetPlan.name,
      date: targetPlan.date ? String(targetPlan.date).slice(0, 10) : '',
      notes: targetPlan.notes || '',
      exercises: [
        ...existingItems,
        {
          exercise_id: exercise.id,
          sets: null,
          reps: null,
          weight_kg: null,
          duration_sec: null,
          rest_sec: null,
        },
      ],
    };

    setAddingPlanExerciseId(String(exercise.id));
    try {
      await plansApi.update(targetPlan.id, payload);
      setMessage(`Pratimas "${exercise.name}" pridetas i plana "${targetPlan.name}".`);
      await loadPlans();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Nepavyko prideti pratimo i plana');
    } finally {
      setAddingPlanExerciseId('');
    }
  };

  return (
    <main className="layout-wide library-page">
      <div className="library-layout">
        <aside className="panel bodypart-menu">
          <h3>Kuno dalys</h3>
          <div className="bodypart-list">
            {bodyPartFilters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                className={`bodypart-btn ${selectedBodyPart === filter.key ? 'active' : ''}`}
                onClick={() => setSelectedBodyPart(filter.key)}
              >
                <span>{filter.label}</span>
                <span className="pill">{bodyPartCounts[filter.key] ?? 0}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="stack">
          <section className="stack">
            <h1>Pratimu biblioteka</h1>
            <label>
              Pratimu paieska
              <input
                value={exerciseSearch}
                onChange={(e) => setExerciseSearch(e.target.value)}
                placeholder="Ivesk pavadinima arba raktaodi"
              />
            </label>
            <FilterBar
              filters={filters}
              onChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
              onReset={() => setFilters(initialFilters)}
            />
          </section>

          <section className="panel grid two-col">
            <label>
              Prideti i plana
              <div className="inline-row">
                <select
                  className="plans-select-list"
                  size={planListSize}
                  value={selectedPlanId}
                  onChange={(event) => setSelectedPlanId(event.target.value)}
                >
                  {plansLoading ? <option value="">Kraunami planai...</option> : null}
                  {!plansLoading && plans.length === 0 ? <option value="">Nera planu</option> : null}
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} - {new Date(plan.date).toLocaleDateString('lt-LT')}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn ghost" onClick={loadPlans}>
                  Atnaujinti sarasa
                </button>
              </div>
            </label>
            <div className="panel" style={{ boxShadow: 'none', margin: 0 }}>
              <p className="meta">1) Gali sukurti plana be pratimu skiltyje "Planai".</p>
              <p className="meta">2) Tada bibliotekoje spausk "Prideti i plana" ant pratimo korteles.</p>
            </div>
          </section>

          <section className="panel">
            <h3>Naujas pratimas</h3>
            <form className="grid two-col" onSubmit={onCreate}>
              <label>
                Pavadinimas
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                />
              </label>
              <label>
                Tipas
                <select
                  value={form.type}
                  onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
                >
                  <option value="jega">Jega</option>
                  <option value="kardio">Kardio</option>
                  <option value="tempimas">Tempimas</option>
                </select>
              </label>
              <label>
                Sunkumas
                <select
                  value={form.difficulty}
                  onChange={(e) => setForm((prev) => ({ ...prev, difficulty: e.target.value }))}
                >
                  <option value="pradedantis">Pradedantis</option>
                  <option value="vidutinis">Vidutinis</option>
                  <option value="pazenges">Pazenges</option>
                </select>
              </label>
              <label>
                Raumenu grupe
                <input
                  value={form.muscle_group}
                  onChange={(e) => setForm((prev) => ({ ...prev, muscle_group: e.target.value }))}
                />
              </label>
              <label>
                Inventorius
                <input
                  value={form.equipment}
                  onChange={(e) => setForm((prev) => ({ ...prev, equipment: e.target.value }))}
                />
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={form.bench_focus}
                  onChange={(e) => setForm((prev) => ({ ...prev, bench_focus: e.target.checked }))}
                />
                Suolio fokusas
              </label>
              <label className="full-width">
                Aprasymas
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                />
              </label>
              <label className="full-width">
                Video failas (pasirinktinai)
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    setNewExerciseVideoFile(file);
                    setNewExerciseUploadProgress(0);
                  }}
                />
                {newExerciseVideoFile ? (
                  <span className="meta">Pasirinktas: {newExerciseVideoFile.name}</span>
                ) : null}
                {newExerciseUploadProgress > 0 ? (
                  <div className="progress-wrap" aria-label="Naujo pratimo video ikelimo progresas">
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${newExerciseUploadProgress}%` }} />
                    </div>
                    <span className="meta">{newExerciseUploadProgress}%</span>
                  </div>
                ) : null}
              </label>
              <button className="btn" type="submit">
                Sukurti pratima
              </button>
            </form>
          </section>

          {error ? <div className="error">{error}</div> : null}
          {message ? <div className="panel success">{message}</div> : null}

          <section className="cards-grid">
            {loading ? <div className="panel">Kraunama...</div> : null}
            {!loading && filteredExercises.length === 0 ? (
              <div className="panel">
                Pratimu pagal si filtra nerasta. Patikrink filtrus ir ar prisijungta import paskyra
                `jump.import.1774763698@test.com`.
              </div>
            ) : null}
            {!loading
              ? filteredExercises.map((exercise) => (
                  <ExerciseCard
                    key={exercise.id}
                    exercise={exercise}
                    videoUrl={resolveVideoUrl(exercise.video_path)}
                    previewUrl={uploadStateByExercise[exercise.id]?.previewUrl || ''}
                    onUpload={handleUpload}
                    onAddToPlan={handleAddToPlan}
                    addingToPlan={String(exercise.id) === String(addingPlanExerciseId)}
                    uploading={Boolean(uploadStateByExercise[exercise.id]?.uploading)}
                    uploadProgress={uploadStateByExercise[exercise.id]?.progress ?? 0}
                  />
                ))
              : null}
          </section>
        </div>
      </div>
    </main>
  );
}
