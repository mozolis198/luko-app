import VideoPlayer from './VideoPlayer';
import { isYouTubeUrl } from '../utils/video';

function formatMeta(exercise) {
  return [exercise.type, exercise.difficulty, exercise.muscle_group, exercise.equipment]
    .filter(Boolean)
    .join(' | ');
}

export default function ExerciseCard({
  exercise,
  videoUrl,
  previewUrl,
  onUpload,
  onAddToPlan,
  addingToPlan,
  uploading,
  uploadProgress,
}) {
  const resolvedVideoUrl = previewUrl || videoUrl;
  const showYouTubeBadge = Boolean(videoUrl && isYouTubeUrl(videoUrl));

  return (
    <article className="card reveal">
      <header className="card-header">
        <h4>{exercise.name}</h4>
        <div className="card-badges">
          {showYouTubeBadge ? <span className="pill youtube-pill">YouTube</span> : null}
          {exercise.bench_focus ? <span className="pill">Suolis</span> : null}
        </div>
      </header>
      <p className="meta">{formatMeta(exercise) || 'Nera metaduomenu'}</p>
      <p className="description">{exercise.description || 'Aprasymas nepridetas.'}</p>
      <VideoPlayer src={resolvedVideoUrl} />
      {typeof onAddToPlan === 'function' ? (
        <button
          type="button"
          className="btn"
          onClick={() => onAddToPlan(exercise)}
          disabled={Boolean(addingToPlan)}
        >
          {addingToPlan ? 'Pridedama...' : 'Prideti i plana'}
        </button>
      ) : null}
      <label className="upload-row">
        <span className="meta">Prideti video (mp4/mov/webm)</span>
        <input
          type="file"
          accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onUpload(exercise.id, file);
            }
            event.target.value = '';
          }}
          disabled={uploading}
        />
      </label>
      {uploading ? <p className="meta">Ikelimas vyksta...</p> : null}
      {typeof uploadProgress === 'number' && uploadProgress > 0 ? (
        <div className="progress-wrap" aria-label="Ikelimo progresas">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
          </div>
          <span className="meta">{uploadProgress}%</span>
        </div>
      ) : null}
    </article>
  );
}
