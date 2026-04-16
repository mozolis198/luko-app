require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { query } = require('../src/db');
const { getAuthorizedClient } = require('./youtube-auth');
const { ensureMinDuration } = require('./video-min-duration');

const scopes = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube'];

const TARGETS = {
  durability10: {
    dir: path.resolve(__dirname, '../../durability10_clips'),
    prefix: 'Full Body Mobility Durability',
    count: 10,
    digits: 2,
  },
  miniband3: {
    dir: path.resolve(__dirname, '../../miniband3_clips'),
    prefix: 'Mini Band Knee Strength',
    count: 3,
    digits: 2,
  },
  finishers20: {
    dir: path.resolve(__dirname, '../../finishers20_clips'),
    prefix: 'Training Finisher',
    count: 20,
    digits: 2,
  },
  landmine24: {
    dir: path.resolve(__dirname, '../../landmine24_clips'),
    prefix: 'Landmine Best',
    count: 24,
    digits: 2,
  },
  mobility33: {
    dir: path.resolve(__dirname, '../../mobility33_clips'),
    prefix: 'Mobility Drill',
    count: 33,
    digits: 2,
  },
  volleywarmup20: {
    dir: path.resolve(__dirname, '../../volley_warmup20_clips'),
    prefix: 'Volleyball Warmup',
    count: 20,
    digits: 2,
  },
  landmine30: {
    dir: path.resolve(__dirname, '../../landmine30_clips'),
    prefix: 'Landmine Full Body',
    count: 30,
    digits: 2,
  },
  landmine40: {
    dir: path.resolve(__dirname, '../../landmine40_clips'),
    prefix: 'Landmine Variation',
    count: 40,
    digits: 2,
  },
  squat41: {
    dir: path.resolve(__dirname, '../../squat41_clips'),
    prefix: 'Squat Variation',
    count: 41,
    digits: 2,
  },
};

function getArg(name) {
  const key = `--${name}`;
  const hit = process.argv.find((arg) => arg.startsWith(`${key}=`));
  return hit ? hit.slice(key.length + 1) : '';
}

function pad(n, digits) {
  return String(n).padStart(digits, '0');
}

async function uploadToYouTube(youtube, filePath, { playlistId, titlePrefix, privacyStatus, minDurationSec }) {
  const base = path.basename(filePath, path.extname(filePath));
  const pretty = base.replace(/^\d+[_\-\s]*/, '').replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const title = titlePrefix ? `${titlePrefix} | ${pretty}` : pretty;
  const prepared = ensureMinDuration(filePath, minDurationSec);

  try {
    const upload = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title,
          description: 'source:luko_app #lukoapp',
          tags: ['lukoapp', 'source:luko_app'],
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
      watchUrl,
      youtubeTitle: title,
      sourceDurationSec: prepared.sourceDuration,
      finalDurationSec: prepared.finalDuration,
      loopedToMinDuration: prepared.looped,
    };
  } finally {
    prepared.cleanup();
  }
}

async function loadExerciseMap() {
  const result = await query('SELECT id, name, video_path FROM exercises');
  const map = new Map();
  for (const row of result.rows) {
    map.set(String(row.name), {
      id: String(row.id),
      videoPath: row.video_path || null,
    });
  }
  return map;
}

function getTargetOrder() {
  const raw = getArg('targets') || process.env.YT_BATCH_TARGETS || 'durability10,miniband3,finishers20,landmine24,mobility33,volleywarmup20,landmine30,landmine40,squat41';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .filter((key) => TARGETS[key]);
}

async function run() {
  const playlistId = process.env.YT_PLAYLIST_ID;
  const titlePrefix = process.env.YT_TITLE_PREFIX || 'LUKO_APP';
  const privacyStatus = process.env.YT_PRIVACY || 'unlisted';
  const minDurationSec = Number(process.env.YT_MIN_DURATION_SEC || 10);
  const maxUploads = Number(getArg('limit') || process.env.YT_BATCH_LIMIT || 25);
  const targetKeys = getTargetOrder();

  if (targetKeys.length === 0) {
    throw new Error('No valid targets selected.');
  }

  const auth = await getAuthorizedClient(scopes);
  const youtube = google.youtube({ version: 'v3', auth });
  const exerciseMap = await loadExerciseMap();

  let uploadedCount = 0;
  const done = [];
  const skipped = [];

  for (const key of targetKeys) {
    if (uploadedCount >= maxUploads) {
      break;
    }

    const target = TARGETS[key];
    if (!fs.existsSync(target.dir)) {
      skipped.push({ target: key, reason: `missing_dir:${target.dir}` });
      continue;
    }

    const files = fs
      .readdirSync(target.dir)
      .filter((name) => name.toLowerCase().endsWith('.mp4'))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => path.join(target.dir, name));

    const count = Math.min(target.count, files.length);
    for (let i = 0; i < count; i += 1) {
      if (uploadedCount >= maxUploads) {
        break;
      }

      const number = pad(i + 1, target.digits);
      const exerciseName = `${target.prefix} ${number}`;
      const exercise = exerciseMap.get(exerciseName);
      const clipPath = files[i];

      if (!exercise) {
        skipped.push({ target: key, file: path.basename(clipPath), exerciseName, reason: 'missing_exercise' });
        continue;
      }

      if (/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(String(exercise.videoPath || ''))) {
        skipped.push({
          target: key,
          file: path.basename(clipPath),
          exerciseName,
          reason: 'already_youtube',
        });
        continue;
      }

      const upload = await uploadToYouTube(youtube, clipPath, {
        playlistId,
        titlePrefix,
        privacyStatus,
        minDurationSec,
      });

      await query('UPDATE exercises SET video_path = $1 WHERE id = $2', [upload.watchUrl, exercise.id]);

      uploadedCount += 1;
      done.push({
        target: key,
        exerciseName,
        exerciseId: exercise.id,
        file: path.basename(clipPath),
        watchUrl: upload.watchUrl,
        sourceDurationSec: Number(upload.sourceDurationSec.toFixed(3)),
        finalDurationSec: Number(upload.finalDurationSec.toFixed(3)),
        loopedToMinDuration: upload.loopedToMinDuration,
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        uploadedCount,
        limit: maxUploads,
        targets: targetKeys,
        done,
        skipped,
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
