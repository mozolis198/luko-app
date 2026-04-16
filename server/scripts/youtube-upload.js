require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { getAuthorizedClient } = require('./youtube-auth');
const { ensureMinDuration } = require('./video-min-duration');

const scopes = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube'];

function getArg(name) {
  const key = `--${name}`;
  const hit = process.argv.find((arg) => arg.startsWith(`${key}=`));
  return hit ? hit.slice(key.length + 1) : '';
}

function normalizeTitle(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  return base
    .replace(/^\d+[_\-\s]*/, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function run() {
  const filePath = getArg('file');
  const playlistId = getArg('playlist') || process.env.YT_PLAYLIST_ID;
  const titlePrefix = getArg('prefix') || process.env.YT_TITLE_PREFIX || 'LUKO_APP';
  const visibility = getArg('privacy') || process.env.YT_PRIVACY || 'unlisted';
  const minDurationSeconds = Number(getArg('min-seconds') || process.env.YT_MIN_DURATION_SEC || 10);

  if (!filePath) {
    throw new Error('Missing required --file argument.');
  }

  const absoluteFile = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absoluteFile)) {
    throw new Error(`Video file not found: ${absoluteFile}`);
  }

  const auth = await getAuthorizedClient(scopes);
  const youtube = google.youtube({ version: 'v3', auth });

  const prepared = ensureMinDuration(absoluteFile, minDurationSeconds);

  const inferredTitle = normalizeTitle(absoluteFile);
  const title = titlePrefix ? `${titlePrefix} | ${inferredTitle}` : inferredTitle;

  try {
    const insertResponse = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title,
          description: 'source:luko_app #lukoapp',
          tags: ['lukoapp', 'source:luko_app'],
        },
        status: {
          privacyStatus: visibility,
        },
      },
      media: {
        body: fs.createReadStream(prepared.filePath),
      },
    });

    const videoId = insertResponse.data.id;
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

    console.log(
      JSON.stringify(
        {
          file: absoluteFile,
          uploadFile: prepared.filePath,
          loopedToMinDuration: prepared.looped,
          sourceDurationSec: Number(prepared.sourceDuration.toFixed(3)),
          finalDurationSec: Number(prepared.finalDuration.toFixed(3)),
          minDurationSec: minDurationSeconds,
          title,
          playlistId: playlistId || null,
          privacyStatus: visibility,
          videoId,
          watchUrl,
        },
        null,
        2
      )
    );
  } finally {
    prepared.cleanup();
  }
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
