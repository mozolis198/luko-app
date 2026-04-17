import { getYouTubeVideoId } from '../utils/video';

export default function VideoPlayer({ src, className = '', emptyClassName = '' }) {
  const frameClassName = ['video-frame', className].filter(Boolean).join(' ');
  const placeholderClassName = ['video-frame', 'video-empty', className, emptyClassName]
    .filter(Boolean)
    .join(' ');

  if (!src) {
    return <div className={placeholderClassName}>Video nepridetas</div>;
  }

  const youtubeId = getYouTubeVideoId(src);
  if (youtubeId) {
    const embedUrl = `https://www.youtube.com/embed/${youtubeId}?rel=0`;
    return (
      <div className={frameClassName}>
        <iframe
          className="video-player"
          src={embedUrl}
          title="Exercise video"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className={frameClassName}>
      <video controls preload="metadata" className="video-player">
        <source src={src} />
        Your browser does not support video.
      </video>
    </div>
  );
}
