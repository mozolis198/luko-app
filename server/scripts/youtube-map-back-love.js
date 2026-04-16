require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { query } = require('../src/db');
const { getAuthorizedClient } = require('./youtube-auth');
const { ensureMinDuration } = require('./video-min-duration');

const scopes = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube'];

function fileTitle(baseName) {
  return baseName
    .replace(/^\d+[_\-\s]*/, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseIds(raw) {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function uploadToYouTube(youtube, filePath, playlistId, titlePrefix, privacyStatus, minDurationSec) {
  const baseName = path.basename(filePath, path.extname(filePath));
  const pretty = fileTitle(baseName);
  const title = titlePrefix ? `${titlePrefix} | ${pretty}` : pretty;
  const prepared = ensureMinDuration(filePath, minDurationSec);

  try {
    const upload = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title,
          description: 'source:luko_app #lukoapp',
          tags: ['lukoapp', 'source:luko_app', 'back_love'],
        },
        status: {
          privacyStatus,
        },
      },
      media: {
        body: fs.createReadStream(prepared.filePath),
      },
    });

    const videoId = upload.data.id;
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

    if (playlistId) {
      await youtube.playlistItems.insert({
        part: ['snippet'],
        requestBody: {
          snippet: {
            playlistId,
            resourceId: {
              kind: 'youtube#video',
              videoId,
            },
          },
        },
      });
    }

    return {
      title,
      watchUrl,
      videoId,
      sourceDurationSec: prepared.sourceDuration,
      finalDurationSec: prepared.finalDuration,
      loopedToMinDuration: prepared.looped,
      uploadFilePath: prepared.filePath,
    };
  } finally {
    prepared.cleanup();
  }
}

async function run() {
  const clipsDir = process.env.BACK_LOVE_CLIPS_DIR || path.resolve(__dirname, '../../back_love_clips');
  const playlistId = process.env.YT_PLAYLIST_ID;
  const titlePrefix = process.env.YT_TITLE_PREFIX || 'LUKO_APP';
  const privacyStatus = process.env.YT_PRIVACY || 'unlisted';
  const minDurationSec = Number(process.env.YT_MIN_DURATION_SEC || 10);
  const exerciseIds = parseIds(
    process.env.BACK_LOVE_EXERCISE_IDS ||
      [
        '2ee3ec6d-2c8b-452f-bfea-9642e1f370b5',
        '45112da8-3d74-4faa-b1e9-9a08f1f5d1f4',
        '0c3fd3f6-cb1f-40b3-8e91-d457e145e47c',
        '9c6fa04c-2081-486e-b6f4-12ee6adff32f',
      ].join(',')
  );

  if (!fs.existsSync(clipsDir)) {
    throw new Error(`Clips directory not found: ${clipsDir}`);
  }

  const files = fs
    .readdirSync(clipsDir)
    .filter((name) => name.toLowerCase().endsWith('.mp4'))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => path.join(clipsDir, name));

  if (files.length < exerciseIds.length) {
    throw new Error(`Need at least ${exerciseIds.length} clips but found ${files.length} in ${clipsDir}`);
  }

  const auth = await getAuthorizedClient(scopes);
  const youtube = google.youtube({ version: 'v3', auth });

  const results = [];
  for (let i = 0; i < exerciseIds.length; i += 1) {
    const exerciseId = exerciseIds[i];
    const filePath = files[i];
    const uploaded = await uploadToYouTube(
      youtube,
      filePath,
      playlistId,
      titlePrefix,
      privacyStatus,
      minDurationSec
    );

    await query(
      `
        UPDATE exercises
        SET video_path = $1
        WHERE id = $2
      `,
      [uploaded.watchUrl, exerciseId]
    );

    results.push({
      exerciseId,
      file: path.basename(filePath),
      uploadFile: path.basename(uploaded.uploadFilePath),
      youtubeTitle: uploaded.title,
      watchUrl: uploaded.watchUrl,
      sourceDurationSec: Number(uploaded.sourceDurationSec.toFixed(3)),
      finalDurationSec: Number(uploaded.finalDurationSec.toFixed(3)),
      loopedToMinDuration: uploaded.loopedToMinDuration,
    });
  }

  console.log(JSON.stringify({ updated: results.length, results }, null, 2));
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
