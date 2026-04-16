import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { exercisesApi, plansApi, resolveVideoUrl } from '../api';
import VideoPlayer from '../components/VideoPlayer';

const EMPTY_DRAFT = {
  name: '',
  date: '',
  notes: '',
  exercises: [],
};

const DRAFT_KEY_PREFIX = 'workout_planner_draft_v1';
const NUMERIC_FIELDS = ['sets', 'reps', 'weight_kg', 'duration_sec', 'rest_sec'];

function createKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getDraftStorageKey(planId) {
  return `${DRAFT_KEY_PREFIX}:${planId}`;
}

function getDraftForPlan(planId, fallbackDraft) {
  try {
    const saved = localStorage.getItem(getDraftStorageKey(planId));
    if (!saved) {
      return fallbackDraft;
    }

    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.exercises)) {
      return fallbackDraft;
    }

    return {
      name: parsed.name || '',
      date: parsed.date || '',
      notes: parsed.notes || '',
      exercises: parsed.exercises.map((item) => ({
        _key: item._key || createKey(),
        exercise_id: item.exercise_id,
        exercise_name: item.exercise_name,
        sets: item.sets ?? '',
        reps: item.reps ?? '',
        weight_kg: item.weight_kg ?? '',
        duration_sec: item.duration_sec ?? '',
        rest_sec: item.rest_sec ?? '',
      })),
    };
  } catch (_error) {
    return fallbackDraft;
  }
}

function validateDraft(draft) {
  const errors = [];

  if (!draft.name.trim()) {
    errors.push('Plano pavadinimas yra privalomas.');
  }

  if (!draft.date) {
    errors.push('Plano data yra privaloma.');
  }

  draft.exercises.forEach((item, index) => {
    NUMERIC_FIELDS.forEach((field) => {
      const value = item[field];
      if (value === '' || value === null || typeof value === 'undefined') {
        return;
      }

      const asNumber = Number(value);
      if (!Number.isFinite(asNumber)) {
        errors.push(`${index + 1} pratimo laukas ${field} turi buti skaicius.`);
        return;
      }

      if (asNumber < 0) {
        errors.push(`${index + 1} pratimo laukas ${field} negali buti neigiamas.`);
      }
    });
  });

  return errors;
}

function mapPlanToDraft(plan) {
  return {
    name: plan.name || '',
    date: plan.date ? String(plan.date).slice(0, 10) : '',
    notes: plan.notes || '',
    exercises: (plan.exercises || []).map((item) => ({
      _key: item.id || createKey(),
      exercise_id: item.exercise_id,
      exercise_name: item.exercise_name || item.exercise_id,
      sets: item.sets ?? '',
      reps: item.reps ?? '',
      weight_kg: item.weight_kg ?? '',
      duration_sec: item.duration_sec ?? '',
      rest_sec: item.rest_sec ?? '',
    })),
  };
}

function SortableItem({ item, videoUrl, onChange, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item._key });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="plan-item">
      <div className="plan-item-head">
        <div className="plan-item-main">
          <button type="button" className="btn ghost" {...attributes} {...listeners}>
            Tempti
          </button>
          <strong>{item.exercise_name || item.exercise_id}</strong>
          <span className="meta">ID: {item.exercise_id}</span>
          <div className="grid plan-item-inputs">
            <label>
              Sets
              <input
                type="number"
                min="0"
                value={item.sets}
                onChange={(e) => onChange(item._key, 'sets', e.target.value)}
              />
            </label>
            <label>
              Reps
              <input
                type="number"
                min="0"
                value={item.reps}
                onChange={(e) => onChange(item._key, 'reps', e.target.value)}
              />
            </label>
            <label>
              Kg
              <input
                type="number"
                min="0"
                step="0.01"
                value={item.weight_kg}
                onChange={(e) => onChange(item._key, 'weight_kg', e.target.value)}
              />
            </label>
            <label>
              Trukme (s)
              <input
                type="number"
                min="0"
                value={item.duration_sec}
                onChange={(e) => onChange(item._key, 'duration_sec', e.target.value)}
              />
            </label>
            <label>
              Poilsis (s)
              <input
                type="number"
                min="0"
                value={item.rest_sec}
                onChange={(e) => onChange(item._key, 'rest_sec', e.target.value)}
              />
            </label>
          </div>
        </div>
        <VideoPlayer src={videoUrl} className="plan-thumb" emptyClassName="plan-thumb" />
      </div>
      <button
        type="button"
        className="btn ghost"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onRemove(item._key)}
      >
        Salinti
      </button>
    </div>
  );
}

export default function Planner() {
  const navigate = useNavigate();
  const location = useLocation();
  const quickAddHandledRef = useRef('');
  const [plans, setPlans] = useState([]);
  const [exerciseLibrary, setExerciseLibrary] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState('new');
  const [selectedExerciseId, setSelectedExerciseId] = useState('');
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [draftSavedAt, setDraftSavedAt] = useState('');
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const sensors = useSensors(useSensor(PointerSensor));
  const validationErrors = useMemo(() => validateDraft(draft), [draft]);
  const planListSize = Math.max(4, Math.min(plans.length + 1, 12));

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) || null,
    [plans, selectedPlanId]
  );

  const filteredExerciseLibrary = useMemo(() => {
    const query = exerciseSearch.trim().toLowerCase();
    if (!query) {
      return exerciseLibrary;
    }

    return exerciseLibrary.filter((exercise) => {
      const haystack = `${exercise.name || ''} ${exercise.description || ''} ${exercise.muscle_group || ''} ${exercise.type || ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [exerciseLibrary, exerciseSearch]);

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [plansResponse, exercisesResponse] = await Promise.all([
        plansApi.list(),
        exercisesApi.list(),
      ]);

      setPlans(plansResponse.data);
      setExerciseLibrary(exercisesResponse.data);
      setSelectedExerciseId((previousSelectedExerciseId) => {
        if (exercisesResponse.data.length === 0) {
          return '';
        }

        const hasPrevious = exercisesResponse.data.some(
          (exercise) => String(exercise.id) === String(previousSelectedExerciseId)
        );

        return hasPrevious ? String(previousSelectedExerciseId) : String(exercisesResponse.data[0].id);
      });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Nepavyko gauti planu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (selectedPlanId === 'new') {
      setDraft(getDraftForPlan('new', EMPTY_DRAFT));
      return;
    }

    if (selectedPlan) {
      localStorage.removeItem(getDraftStorageKey(selectedPlanId));
      setDraft(mapPlanToDraft(selectedPlan));
    }
  }, [selectedPlanId, selectedPlan]);

  useEffect(() => {
    if (loading || selectedPlanId !== 'new') {
      return;
    }

    const timeoutId = setTimeout(() => {
      localStorage.setItem(getDraftStorageKey(selectedPlanId), JSON.stringify(draft));
      setDraftSavedAt(new Date().toISOString());
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [draft, selectedPlanId, loading]);

  const appendExerciseToDraft = (exerciseToAdd) => {
    if (!exerciseToAdd) return;

    setDraft((prev) => ({
      ...prev,
      exercises: [
        ...prev.exercises,
        {
          _key: createKey(),
          exercise_id: exerciseToAdd.id,
          exercise_name: exerciseToAdd.name,
          sets: '',
          reps: '',
          weight_kg: '',
          duration_sec: '',
          rest_sec: '',
        },
      ],
    }));
  };

  const addExerciseToDraft = () => {
    if (!selectedExerciseId) return;
    const selectedExercise = exerciseLibrary.find(
      (exercise) => String(exercise.id) === String(selectedExerciseId)
    );
    const fallbackExercise = exerciseLibrary[0];
    appendExerciseToDraft(selectedExercise || fallbackExercise);
  };

  useEffect(() => {
    const quickAdd = location.state?.quickAdd;
    if (!quickAdd || loading || exerciseLibrary.length === 0) {
      return;
    }

    const quickAddToken = String(quickAdd.token || quickAdd.exerciseId || '');
    if (!quickAddToken || quickAddHandledRef.current === quickAddToken) {
      return;
    }

    const targetExerciseId = String(quickAdd.exerciseId || '');
    const targetExercise = exerciseLibrary.find((exercise) => String(exercise.id) === targetExerciseId);

    if (!targetExercise) {
      setError('Nepavyko rasti pratimo bibliotekoje.');
      quickAddHandledRef.current = quickAddToken;
      navigate('/planner', { replace: true, state: null });
      return;
    }

    appendExerciseToDraft(targetExercise);
    setSelectedExerciseId(targetExerciseId);
    setError('');
    setMessage(`Pratimas "${targetExercise.name}" pridetas i plana.`);
    quickAddHandledRef.current = quickAddToken;
    navigate('/planner', { replace: true, state: null });
  }, [location.state, loading, exerciseLibrary, navigate]);

  useEffect(() => {
    if (filteredExerciseLibrary.length === 0) {
      setSelectedExerciseId('');
      return;
    }

    const hasSelected = filteredExerciseLibrary.some(
      (exercise) => String(exercise.id) === String(selectedExerciseId)
    );

    if (!hasSelected) {
      setSelectedExerciseId(String(filteredExerciseLibrary[0].id));
    }
  }, [filteredExerciseLibrary, selectedExerciseId]);

  const updateDraftItem = (key, field, value) => {
    if (NUMERIC_FIELDS.includes(field)) {
      if (value !== '') {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 0) {
          return;
        }
      }
    }

    setDraft((prev) => ({
      ...prev,
      exercises: prev.exercises.map((item) => (item._key === key ? { ...item, [field]: value } : item)),
    }));
  };

  const removeDraftItem = (key) => {
    setDraft((prev) => ({
      ...prev,
      exercises: prev.exercises.filter((item) => item._key !== key),
    }));
  };

  const onDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setDraft((prev) => {
      const oldIndex = prev.exercises.findIndex((item) => item._key === active.id);
      const newIndex = prev.exercises.findIndex((item) => item._key === over.id);
      if (oldIndex < 0 || newIndex < 0) {
        return prev;
      }

      return {
        ...prev,
        exercises: arrayMove(prev.exercises, oldIndex, newIndex),
      };
    });
  };

  const toNumberOrNull = (value) => {
    if (value === '' || value === null || typeof value === 'undefined') {
      return null;
    }
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  };

  const savePlan = async () => {
    if (validationErrors.length > 0) {
      setError(validationErrors[0]);
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const payload = {
        name: draft.name,
        date: draft.date,
        notes: draft.notes,
        exercises: draft.exercises.map((item) => ({
          exercise_id: item.exercise_id,
          sets: toNumberOrNull(item.sets),
          reps: toNumberOrNull(item.reps),
          weight_kg: toNumberOrNull(item.weight_kg),
          duration_sec: toNumberOrNull(item.duration_sec),
          rest_sec: toNumberOrNull(item.rest_sec),
        })),
      };

      if (selectedPlanId === 'new') {
        const response = await plansApi.create(payload);
        localStorage.removeItem(getDraftStorageKey('new'));
        localStorage.removeItem(getDraftStorageKey(response.data.id));
        setSelectedPlanId(response.data.id);
        setMessage('Planas sukurtas.');
      } else {
        await plansApi.update(selectedPlanId, payload);
        localStorage.removeItem(getDraftStorageKey(selectedPlanId));
        setMessage('Planas atnaujintas.');
      }

      await loadAll();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Nepavyko issaugoti plano');
    } finally {
      setSaving(false);
    }
  };

  const deletePlan = async () => {
    if (selectedPlanId === 'new') {
      localStorage.removeItem(getDraftStorageKey('new'));
      setDraft(EMPTY_DRAFT);
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await plansApi.remove(selectedPlanId);
      localStorage.removeItem(getDraftStorageKey(selectedPlanId));
      setSelectedPlanId('new');
      setDraft(EMPTY_DRAFT);
      setMessage('Planas istrintas.');
      await loadAll();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Nepavyko istrinti plano');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="layout-wide">
      <h1>Dienos planai</h1>
      {loading ? <div className="panel">Kraunama...</div> : null}
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="panel success">{message}</div> : null}
      {draftSavedAt ? (
        <p className="meta">Draft issaugotas lokaliai: {new Date(draftSavedAt).toLocaleTimeString('lt-LT')}</p>
      ) : null}
      {validationErrors.length > 0 ? <div className="error">{validationErrors[0]}</div> : null}

      {!loading ? (
        <section className="panel grid two-col">
          <label className="full-width">
            Pasirink planą
            <select
              className="plans-select-list"
              size={planListSize}
              value={selectedPlanId}
              onChange={(e) => setSelectedPlanId(e.target.value)}
            >
              <option value="new">Naujas planas</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} - {new Date(plan.date).toLocaleDateString('lt-LT')}
                </option>
              ))}
            </select>
          </label>

          <label>
            Prideti pratima is bibliotekos
            <div className="inline-row">
              <input
                value={exerciseSearch}
                onChange={(e) => setExerciseSearch(e.target.value)}
                placeholder="Paieska pagal pavadinima"
              />
              <select
                value={selectedExerciseId}
                onChange={(e) => setSelectedExerciseId(e.target.value)}
                disabled={filteredExerciseLibrary.length === 0}
              >
                {filteredExerciseLibrary.length === 0 ? <option value="">Nera pratimu</option> : null}
                {filteredExerciseLibrary.map((exercise) => (
                  <option key={exercise.id} value={String(exercise.id)}>
                    {exercise.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn"
                onClick={addExerciseToDraft}
                disabled={filteredExerciseLibrary.length === 0}
              >
                Prideti
              </button>
            </div>
          </label>

          <label>
            Plano pavadinimas
            <input
              value={draft.name}
              onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Koju diena"
            />
          </label>

          <label>
            Data
            <input
              type="date"
              value={draft.date}
              onChange={(e) => setDraft((prev) => ({ ...prev, date: e.target.value }))}
            />
          </label>

          <label className="full-width">
            Pastabos
            <textarea
              rows={3}
              value={draft.notes}
              onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </label>
        </section>
      ) : null}

      {!loading && draft.exercises.length === 0 ? <div className="panel">Dar neprideta pratimu.</div> : null}

      {!loading ? (
        <section className="stack">
          <h3>Plano eile (drag & drop)</h3>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
              items={draft.exercises.map((item) => item._key)}
              strategy={verticalListSortingStrategy}
            >
              {draft.exercises.map((item) => {
                const linkedExercise = exerciseLibrary.find(
                  (exercise) => String(exercise.id) === String(item.exercise_id)
                );
                const videoUrl = resolveVideoUrl(linkedExercise?.video_path);

                return (
                  <SortableItem
                    key={item._key}
                    item={item}
                    videoUrl={videoUrl}
                    onChange={updateDraftItem}
                    onRemove={removeDraftItem}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        </section>
      ) : null}

      <section className="inline-row">
        <button type="button" className="btn" onClick={savePlan} disabled={saving || validationErrors.length > 0}>
          {saving ? 'Saugoma...' : selectedPlanId === 'new' ? 'Sukurti plana' : 'Atnaujinti plana'}
        </button>
        <button type="button" className="btn ghost" onClick={deletePlan} disabled={saving}>
          {selectedPlanId === 'new' ? 'Isvalyti forma' : 'Istrinti plana'}
        </button>
      </section>
    </main>
  );
}
