import { getYouTubeVideoId } from '../utils/video';

export default function VideoPlayer({ src, className = '', emptyClassName = '' }) {
  const playerClassName = ['video-player', className].filter(Boolean).join(' ');
  const placeholderClassName = ['video-empty', emptyClassName].filter(Boolean).join(' ');

  if (!src) {
    return <div className={placeholderClassName}>Video nepridetas</div>;
  }

  const youtubeId = getYouTubeVideoId(src);
  if (youtubeId) {
    const embedUrl = `https://www.youtube.com/embed/${youtubeId}?rel=0`;
    return (
      <iframe
        className={playerClassName}
        src={embedUrl}
        title="Exercise video"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    );
  }

  return (
    <video controls preload="metadata" className={playerClassName}>
      <source src={src} />
      Your browser does not support video.
    </video>
  );
}
