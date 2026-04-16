export function getYouTubeVideoId(url) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (host === 'youtu.be' || host === 'www.youtu.be') {
      return parsed.pathname.split('/').filter(Boolean)[0] || null;
    }

    if (host.endsWith('youtube.com')) {
      const watchId = parsed.searchParams.get('v');
      if (watchId) {
        return watchId;
      }

      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts[0] === 'shorts' || parts[0] === 'embed') {
        return parts[1] || null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function isYouTubeUrl(url) {
  return Boolean(getYouTubeVideoId(url));
}
